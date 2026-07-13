"""
HTTP Safety Utilities for SSRF Protection

Provides safe HTTP request functions that block:
- Private IP ranges (127.0.0.1, 10/8, 172.16/12, 192.168/16)
- Link-local addresses (169.254/16)
- Cloud metadata endpoints (169.254.169.254)
- Localhost hostnames
"""

import socket
import ipaddress
import logging
from typing import Set, Optional, Dict, Union, Tuple
from urllib.parse import urlparse
import requests
from extension_shield.core.config import get_settings

logger = logging.getLogger(__name__)


def is_private_ip(ip: str) -> bool:
    """
    Check if an IP address is private, link-local, multicast, reserved, or loopback.
    
    Args:
        ip: IP address string
        
    Returns:
        True if IP is private/reserved/loopback
    """
    try:
        ip_obj = ipaddress.ip_address(ip)
        return (
            ip_obj.is_private or
            ip_obj.is_link_local or
            ip_obj.is_multicast or
            ip_obj.is_reserved or
            ip_obj.is_loopback
        )
    except ValueError:
        # Invalid IP format
        return True


def resolve_host_ips(hostname: str) -> list[str]:
    """
    Resolve hostname to list of IP addresses.
    
    Args:
        hostname: Hostname to resolve
        
    Returns:
        List of IP addresses (IPv4 and IPv6)
    """
    ips = []
    try:
        # Get all address families (IPv4 and IPv6)
        addrinfo = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, _, _, _, sockaddr in addrinfo:
            if family == socket.AF_INET:
                # IPv4: (host, port)
                ip = sockaddr[0]
                ips.append(ip)
            elif family == socket.AF_INET6:
                # IPv6: (host, port, flowinfo, scopeid)
                ip = sockaddr[0]
                ips.append(ip)
    except (socket.gaierror, socket.herror, OSError) as e:
        logger.warning("Failed to resolve hostname %s: %s", hostname, e)
    return ips


def validate_outbound_url(url: str, allowed_hosts: Set[str]) -> None:
    """
    Validate that a URL is safe for outbound requests (SSRF protection).
    
    Blocks:
    - Private IP ranges
    - Link-local addresses
    - Localhost hostnames
    - Hosts not in allowed_hosts
    
    Args:
        url: URL to validate
        allowed_hosts: Set of allowed hostnames (exact match or suffix match with leading dot)
        
    Raises:
        ValueError: If URL is blocked
    """
    parsed = urlparse(url)
    
    # Require HTTPS (except for localhost in dev, but we block localhost anyway)
    if parsed.scheme not in ("https", "http"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")
    
    # Require HTTPS in production
    settings = get_settings()
    if settings.is_prod() and parsed.scheme != "https":
        raise ValueError("HTTPS required in production")
    
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL missing hostname")
    
    hostname = hostname.lower()
    
    # Block localhost hostnames
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError(f"Blocked localhost hostname: {hostname}")
    
    # Block if hostname is an IP address and it's private
    try:
        if is_private_ip(hostname):
            raise ValueError(f"Blocked private IP address: {hostname}")
    except ValueError:
        # Not an IP, continue with hostname check
        pass
    
    # Check if hostname is in allowed_hosts (exact match or suffix match)
    allowed = False
    for allowed_host in allowed_hosts:
        if allowed_host.startswith("."):
            # Suffix match (e.g., ".google.com" matches "chromewebstore.google.com")
            if hostname == allowed_host[1:] or hostname.endswith(allowed_host):
                allowed = True
                break
        else:
            # Exact match
            if hostname == allowed_host:
                allowed = True
                break
    
    if not allowed:
        raise ValueError(f"Hostname not in allowed list: {hostname}")
    
    # Resolve DNS and check all IPs
    resolved_ips = resolve_host_ips(hostname)
    if not resolved_ips:
        # DNS resolution failed - block to be safe
        raise ValueError(f"Failed to resolve hostname: {hostname}")
    
    # Check all resolved IPs
    for ip in resolved_ips:
        if is_private_ip(ip):
            raise ValueError(f"Hostname resolves to private IP: {hostname} -> {ip}")


def safe_get(
    url: str,
    *,
    allowed_hosts: Set[str],
    timeout: Union[int, Tuple[int, int]] = 30,
    headers: Optional[Dict[str, str]] = None,
    stream: bool = False,
    max_bytes: int = 25 * 1024 * 1024,  # 25MB default
    **kwargs
) -> requests.Response:
    """
    Safe HTTP GET request with SSRF protection.
    
    Args:
        url: URL to fetch
        allowed_hosts: Set of allowed hostnames
        timeout: Request timeout (int or tuple)
        headers: Optional request headers
        stream: Whether to stream the response
        max_bytes: Maximum response size (default 25MB)
        **kwargs: Additional arguments passed to requests.get
        
    Returns:
        requests.Response object
        
    Raises:
        ValueError: If URL is blocked or response exceeds max_bytes
        requests.RequestException: For network errors
    """
    # Validate URL before making request
    validate_outbound_url(url, allowed_hosts)
    
    # Make request
    response = requests.get(url, timeout=timeout, headers=headers, stream=stream, **kwargs)
    
    # Enforce max_bytes
    if stream:
        # For streaming, we can't check total size upfront
        # The caller should handle chunked reading and stop if needed
        # We'll check the Content-Length header if available
        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                size = int(content_length)
            except (TypeError, ValueError):
                # Bad Content-Length header: warn and let it through.
                logger.warning("Invalid Content-Length header: %s", content_length)
            else:
                # Check the size here, not inside the try above, so this error
                # is not caught by the except and lost.
                if size > max_bytes:
                    response.close()
                    raise ValueError(f"Response too large: {size} bytes (max: {max_bytes})")
    else:
        # For non-streaming, check content size
        if len(response.content) > max_bytes:
            raise ValueError(f"Response too large: {len(response.content)} bytes (max: {max_bytes})")
    
    return response

