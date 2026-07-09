"""Wording guard for the active summary-generation prompts.

Ensures capability-only exfiltration signals are described as a *possibility*
("could expose data externally") and never regress to confirmed-exfiltration
phrasing like "sends your data out". Wording-only; asserts nothing about
scoring, gates, or verdicts.
"""

from extension_shield.llm.prompts import get_prompts

# The three active user-facing summary prompts that carry the plain-English
# translation table for the "Exfiltration" concept.
SUMMARY_PROMPT_KEYS = ("summary_rewrite", "consumer_summary_unified", "summary_generation")

# Confirmed-exfiltration phrasings that must not appear in these prompts.
FORBIDDEN_PHRASES = ("sends your data out", "may leak", "send sensitive data")


def _load_summary_prompts() -> dict:
    return get_prompts("summary_generation")


def test_summary_prompts_present():
    prompts = _load_summary_prompts()
    for key in SUMMARY_PROMPT_KEYS:
        assert key in prompts, f"missing summary prompt: {key}"


def test_no_confirmed_exfiltration_wording():
    """Active summary prompts must not assert confirmed exfiltration."""
    prompts = _load_summary_prompts()
    for key in SUMMARY_PROMPT_KEYS:
        text = prompts[key].lower()
        for phrase in FORBIDDEN_PHRASES:
            assert phrase not in text, f"{key} still contains confirmed-exfiltration phrasing: {phrase!r}"


def test_exfiltration_uses_capability_wording():
    """The Exfiltration translation stays capability/uncertainty language."""
    prompts = _load_summary_prompts()
    for key in SUMMARY_PROMPT_KEYS:
        text = prompts[key]
        # The concept must still be present (do not remove the data-transfer idea).
        assert "Exfiltration" in text, f"{key} dropped the Exfiltration concept"
        assert "could expose data externally" in text, (
            f"{key} lost capability-only exfiltration wording"
        )
