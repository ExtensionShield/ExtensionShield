"""LLM fallback client module for multi-provider support with automatic failover."""

import os
import re
import logging
import threading
from typing import Dict, Optional, Any, List
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage

from extension_shield.llm.clients.provider_type import LLMProviderType
from extension_shield.llm.clients import get_chat_llm_client

logger = logging.getLogger(__name__)

# Patterns that may indicate leaked secrets in error messages
_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9\-_]{10,}", re.IGNORECASE),       # OpenAI/Groq keys
    re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]{10,}", re.IGNORECASE),  # Bearer tokens
    re.compile(r"key[=:\s]+['\"]?[A-Za-z0-9\-_]{20,}['\"]?", re.IGNORECASE),  # Generic key=value
]


def _sanitize_error_message(msg: str) -> str:
    """Remove potential secrets (API keys, tokens) from error messages."""
    for pattern in _SECRET_PATTERNS:
        msg = pattern.sub("[REDACTED]", msg)
    return msg


class LLMFallbackError(Exception):
    """Exception raised when all LLM providers fail."""

    def __init__(self, errors: Dict[str, str]):
        self.errors = errors
        error_summary = "; ".join([f"{provider}: {error}" for provider, error in errors.items()])
        super().__init__(f"All LLM providers failed: {error_summary}")


def _parse_fallback_chain() -> List[LLMProviderType]:
    """Parse LLM_FALLBACK_CHAIN environment variable.

    Returns:
        List of provider types in fallback order.
    """
    fallback_chain = os.getenv("LLM_FALLBACK_CHAIN", "").strip()
    primary_provider = os.getenv("LLM_PROVIDER_PRIMARY") or os.getenv("LLM_PROVIDER")

    # If LLM_FALLBACK_CHAIN is set, use it
    if fallback_chain:
        providers = []
        for provider_str in fallback_chain.split(","):
            provider_str = provider_str.strip().lower()
            try:
                providers.append(LLMProviderType(provider_str))
            except ValueError:
                logger.warning(f"Invalid provider in LLM_FALLBACK_CHAIN: {provider_str}, skipping")
        if providers:
            return providers

    # If LLM_PROVIDER is set, use it as single provider
    if primary_provider:
        try:
            return [LLMProviderType(primary_provider.lower())]
        except ValueError:
            logger.warning(f"Invalid LLM_PROVIDER: {primary_provider}, using default")

    # Default to groq (free tier), then watsonx, then openai
    return [LLMProviderType.GROQ, LLMProviderType.WATSONX, LLMProviderType.OPENAI]


def _invoke_with_timeout(
    llm: BaseChatModel, messages: List[BaseMessage], timeout_seconds: int, **kwargs
) -> Any:
    """Invoke LLM with timeout using threading.

    Args:
        llm: The LLM client to invoke.
        messages: Messages to send to the LLM.
        timeout_seconds: Maximum time to wait for response.
        **kwargs: Additional arguments for invoke.

    Returns:
        The LLM response.

    Raises:
        TimeoutError: If the invocation exceeds timeout_seconds.
    """
    result = [None]
    exception = [None]

    def target():
        try:
            result[0] = llm.invoke(messages, **kwargs)
        except Exception as e:
            exception[0] = e

    thread = threading.Thread(target=target)
    thread.daemon = True
    thread.start()
    thread.join(timeout=timeout_seconds)

    if thread.is_alive():
        # Thread is still running, timeout occurred
        raise TimeoutError(f"LLM invocation timed out after {timeout_seconds} seconds")

    if exception[0]:
        raise exception[0]

    return result[0]


def _is_retryable_error(error: Exception) -> bool:
    """Check if an error is retryable (network, auth, 5xx, timeout).

    Args:
        error: The exception to check.

    Returns:
        True if the error is retryable, False otherwise.
    """
    error_str = str(error).lower()
    error_type = type(error).__name__.lower()

    # Network errors
    if any(keyword in error_str for keyword in ["connection", "network", "timeout", "refused", "unreachable"]):
        return True

    # Timeout errors
    if "timeout" in error_type or isinstance(error, TimeoutError):
        return True

    # HTTP errors (5xx, 401, 403)
    if any(code in error_str for code in ["500", "501", "502", "503", "504", "401", "403"]):
        return True

    # Auth errors
    if any(keyword in error_str for keyword in ["authentication", "unauthorized", "forbidden", "api key", "invalid key"]):
        return True

    return False


def get_chat_llm_client_with_fallback(
    model_name: str,
    model_parameters: Optional[Dict] = None,
    provider_override: Optional[LLMProviderType] = None,
) -> BaseChatModel:
    """Get a chat LLM client with fallback support.

    This function returns a client for the first provider in the fallback chain.
    For actual fallback behavior, use invoke_with_fallback().

    Args:
        model_name: The name of the model to use.
        model_parameters: Optional model parameters.
        provider_override: Optional provider to use instead of env config.

    Returns:
        The LLM client instance for the primary provider.
    """
    if provider_override:
        # Temporarily override provider by passing it to get_chat_llm_client
        # We'll need to modify get_chat_llm_client to accept this
        return get_chat_llm_client(
            model_name=model_name,
            model_parameters=model_parameters,
            provider_override=provider_override,
        )

    fallback_chain = _parse_fallback_chain()
    primary_provider = fallback_chain[0] if fallback_chain else LLMProviderType.WATSONX

    return get_chat_llm_client(
        model_name=model_name,
        model_parameters=model_parameters,
        provider_override=primary_provider,
    )


def _get_provider_model_name(provider: LLMProviderType, model_name: str) -> str:
    """Get provider-specific model name.
    
    Args:
        provider: The LLM provider type.
        model_name: The requested model name.
        
    Returns:
        Provider-specific model name.
    """
    # Model name mappings per provider
    provider_models = {
        LLMProviderType.GROQ: {
            # Map common model names to Groq equivalents (see https://console.groq.com/docs/models)
            "gpt-4o": "llama-3.3-70b-versatile",  # Groq production 70B
            "gpt-4o-mini": "llama-3.1-8b-instant",
            "meta-llama/llama-3-3-70b-instruct": "llama-3.1-8b-instant",  # Fast, free tier
            "meta-llama/llama-3-1-70b": "llama-3.1-8b-instant",
            "llama-3.1-70b-versatile": "llama-3.1-8b-instant",  # Decommissioned -> instant
            "rits/openai/gpt-oss-20b": "llama-3.1-8b-instant",
            "rits/openai/gpt-oss-120b": "llama-3.1-8b-instant",
            # Default Groq models
            "llama-3.1-8b-instant": "llama-3.1-8b-instant",
            "mixtral-8x7b-32768": "mixtral-8x7b-32768",
        },
        LLMProviderType.WATSONX: {
            # WatsonX uses full model paths
            "llama-3.1-8b-instant": "meta-llama/llama-3-3-70b-instruct",
            "mixtral-8x7b-32768": "meta-llama/llama-3-3-70b-instruct",
        },
        LLMProviderType.OPENAI: {
            # OpenAI models
            "llama-3.1-8b-instant": "gpt-4o-mini",
            "meta-llama/llama-3-3-70b-instruct": "gpt-4o-mini",
        },
    }
    
    # Check if we have a mapping for this provider and model
    if provider in provider_models:
        if model_name in provider_models[provider]:
            return provider_models[provider][model_name]
    
    # Default: return model name as-is (may fail, but let provider handle it)
    return model_name


def invoke_with_fallback(
    messages: List[BaseMessage],
    model_name: str,
    model_parameters: Optional[Dict] = None,
    **kwargs,
) -> Any:
    """Invoke LLM with automatic fallback across multiple providers.

    Args:
        messages: Messages to send to the LLM.
        model_name: The name of the model to use.
        model_parameters: Optional model parameters.
        **kwargs: Additional arguments for invoke.

    Returns:
        The LLM response from the first successful provider.

    Raises:
        LLMFallbackError: If all providers fail.
    """
    fallback_chain = _parse_fallback_chain()
    timeout_seconds = int(os.getenv("LLM_TIMEOUT_SECONDS", "25"))
    max_retries = int(os.getenv("LLM_MAX_RETRIES_PER_PROVIDER", "1"))

    if not fallback_chain:
        raise ValueError("No LLM providers configured in fallback chain")

    errors: Dict[str, str] = {}

    for provider in fallback_chain:
        provider_name = provider.value
        logger.info(f"Attempting LLM invocation with provider: {provider_name}, model: {model_name}")

        for attempt in range(max_retries + 1):
            try:
                # Get provider-specific model name
                provider_model_name = _get_provider_model_name(provider, model_name)
                
                # Get client for this provider
                llm = get_chat_llm_client(
                    model_name=provider_model_name,
                    model_parameters=model_parameters,
                    provider_override=provider,
                )

                # Invoke with timeout (filter out max_retries from kwargs as it's not an LLM parameter)
                filtered_kwargs = {k: v for k, v in kwargs.items() if k != 'max_retries'}
                result = _invoke_with_timeout(llm, messages, timeout_seconds, **filtered_kwargs)

                if attempt > 0:
                    logger.info(f"LLM invocation succeeded with provider {provider_name} on retry {attempt}")
                else:
                    logger.info(f"LLM invocation succeeded with provider: {provider_name}")

                return result

            except Exception as e:
                error_msg = str(e)
                error_type = type(e).__name__

                # Log the error (without secrets)
                if _is_retryable_error(e):
                    logger.warning(
                        f"LLM provider {provider_name} failed (attempt {attempt + 1}/{max_retries + 1}): "
                        f"{error_type}: {error_msg[:200]}"
                    )
                else:
                    # Non-retryable error (e.g., invalid input, model not found)
                    logger.error(
                        f"LLM provider {provider_name} failed with non-retryable error: "
                        f"{error_type}: {error_msg[:200]}"
                    )
                    # Don't retry non-retryable errors
                    break

                # Store sanitized error for final exception (strip potential secrets)
                errors[f"{provider_name} (attempt {attempt + 1})"] = f"{error_type}: {_sanitize_error_message(error_msg[:200])}"

                # If this was the last retry for this provider, try next provider
                if attempt < max_retries:
                    logger.debug(f"Retrying with provider {provider_name}...")
                else:
                    logger.warning(f"Provider {provider_name} exhausted all retries, trying next provider...")

    # All providers failed
    logger.error(f"All LLM providers failed. Attempted: {', '.join([p.value for p in fallback_chain])}")
    raise LLMFallbackError(errors)

