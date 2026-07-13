"""Regression tests for the CRX-download size bug.

`safe_get` previously raised its "Response too large" ValueError *inside* the same
try block whose `except ValueError` was meant only for a bad Content-Length header,
so the size guard was silently swallowed — after `response.close()` had already run.
Callers streaming the (now-closed) response wrote 0 bytes, surfacing as
"Extension download returned no file" for any extension over the 25MB default cap
(e.g. AdBlock ~75MB).
"""
from unittest.mock import MagicMock, patch

import pytest

from extension_shield.utils import http_safety


def _resp(content_length):
    r = MagicMock()
    r.headers = {} if content_length is None else {"Content-Length": str(content_length)}
    r.close = MagicMock()
    return r


@patch.object(http_safety, "validate_outbound_url", lambda *a, **k: None)
@patch.object(http_safety.requests, "get")
def test_oversized_stream_raises_cleanly(mock_get):
    resp = _resp(50 * 1024 * 1024)  # 50MB > 25MB cap
    mock_get.return_value = resp
    with pytest.raises(ValueError, match="Response too large"):
        http_safety.safe_get(
            "https://clients2.google.com/x",
            allowed_hosts={"clients2.google.com"},
            stream=True,
            max_bytes=25 * 1024 * 1024,
        )
    resp.close.assert_called_once()  # closed, but the error propagates (not swallowed)


@patch.object(http_safety, "validate_outbound_url", lambda *a, **k: None)
@patch.object(http_safety.requests, "get")
def test_under_cap_returns_response(mock_get):
    resp = _resp(1 * 1024 * 1024)  # 1MB < cap
    mock_get.return_value = resp
    got = http_safety.safe_get(
        "https://clients2.google.com/x",
        allowed_hosts={"clients2.google.com"},
        stream=True,
        max_bytes=25 * 1024 * 1024,
    )
    assert got is resp
    resp.close.assert_not_called()


@patch.object(http_safety, "validate_outbound_url", lambda *a, **k: None)
@patch.object(http_safety.requests, "get")
def test_large_cap_allows_75mb(mock_get):
    """With a CRX-appropriate cap (like the downloader now passes), 75MB is allowed."""
    resp = _resp(75 * 1024 * 1024)
    mock_get.return_value = resp
    got = http_safety.safe_get(
        "https://clients2.google.com/x",
        allowed_hosts={"clients2.google.com"},
        stream=True,
        max_bytes=200 * 1024 * 1024,
    )
    assert got is resp


@patch.object(http_safety, "validate_outbound_url", lambda *a, **k: None)
@patch.object(http_safety.requests, "get")
def test_invalid_content_length_does_not_raise(mock_get):
    resp = _resp("not-a-number")
    mock_get.return_value = resp
    got = http_safety.safe_get(
        "https://clients2.google.com/x",
        allowed_hosts={"clients2.google.com"},
        stream=True,
        max_bytes=25 * 1024 * 1024,
    )
    assert got is resp  # warns, does not raise, does not close
