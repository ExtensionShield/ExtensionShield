import asyncio
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from extension_shield.api.main import _read_upload_with_limit, app
from extension_shield.core.config import get_settings


class _AsyncChunkFile:
    def __init__(self, payload: bytes):
        self._payload = payload
        self._offset = 0

    async def read(self, size: int = -1) -> bytes:
        if self._offset >= len(self._payload):
            return b""
        if size is None or size < 0:
            size = len(self._payload) - self._offset
        chunk = self._payload[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


def _settings(upload_max_bytes: int) -> MagicMock:
    settings = MagicMock()
    settings.is_prod.return_value = False
    settings.upload_max_bytes = upload_max_bytes
    return settings


def test_upload_rejects_payload_above_configured_limit(tmp_path):
    """Uploaded CRX/ZIP payloads larger than the configured limit are rejected before saving."""
    client = TestClient(app)

    with patch("extension_shield.api.main.get_settings", return_value=_settings(4)), \
         patch("extension_shield.api.main.RESULTS_DIR", tmp_path), \
         patch("extension_shield.api.main.run_analysis_workflow") as run_analysis:
        response = client.post(
            "/api/scan/upload",
            files={"file": ("extension.zip", b"PK\x03\x04X", "application/zip")},
        )

    assert response.status_code == 413
    assert response.json()["detail"] == "File too large. Maximum size is 4 bytes."
    assert list(tmp_path.iterdir()) == []
    run_analysis.assert_not_called()


def test_bounded_reader_accepts_payload_at_configured_limit():
    """Payloads exactly at the configured byte limit are accepted by the bounded reader."""
    result = asyncio.run(_read_upload_with_limit(_AsyncChunkFile(b"1234"), 4))

    assert result == b"1234"


def test_invalid_upload_limit_env_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("UPLOAD_MAX_BYTES", "not-an-int")

    assert get_settings().upload_max_bytes == 104_857_600
