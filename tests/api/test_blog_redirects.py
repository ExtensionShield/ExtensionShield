"""
Tests for the permanent (301) redirect map served by the SPA catch-all.

Retired URLs must return a real HTTP 301 to the surviving page. A client-side
<Navigate> alone does not reliably consolidate ranking signals, so a regression
here silently undoes the 2026-07 blog consolidation (21 posts -> 7) without
breaking anything a user would notice.
"""

import json

import pytest
from fastapi.testclient import TestClient

from extension_shield.api import main as api_main
from extension_shield.api.main import app


@pytest.fixture
def client():
    # follow_redirects=False so we assert on the 301 itself, not the destination.
    return TestClient(app, follow_redirects=False)


@pytest.fixture
def redirect_map(monkeypatch):
    """Install a known redirect map regardless of whether dist/ has been built."""
    fake = {
        "/blog/spin-ai-vs-extensionshield": "/compare/spin-ai",
        "/blog/extension-security-scoring-explained": "/research/methodology",
        "/blog/can-chrome-extensions-steal-cookies-sessions": "/blog/can-chrome-extensions-steal-data",
    }
    monkeypatch.setattr(api_main, "_REDIRECTS", fake)
    return fake


def test_retired_url_returns_301_to_surviving_page(client, redirect_map):
    response = client.get("/blog/spin-ai-vs-extensionshield")
    assert response.status_code == 301
    assert response.headers["location"] == "/compare/spin-ai"


def test_redirect_is_permanent_not_temporary(client, redirect_map):
    """302 would tell Google to keep the old URL indexed."""
    for src in redirect_map:
        assert client.get(src).status_code == 301


def test_trailing_slash_variant_also_redirects(client, redirect_map):
    response = client.get("/blog/spin-ai-vs-extensionshield/")
    assert response.status_code == 301
    assert response.headers["location"] == "/compare/spin-ai"


def test_query_string_is_preserved(client, redirect_map):
    """Campaign params must survive the hop or attribution breaks."""
    response = client.get("/blog/spin-ai-vs-extensionshield?utm_source=newsletter&x=1")
    assert response.status_code == 301
    assert response.headers["location"] == "/compare/spin-ai?utm_source=newsletter&x=1"


def test_surviving_post_is_not_redirected(client, redirect_map):
    response = client.get("/blog/can-chrome-extensions-steal-data")
    assert response.status_code != 301


def test_api_routes_are_never_redirected(client, monkeypatch):
    """A stray map entry must not be able to hijack an API path."""
    monkeypatch.setattr(api_main, "_REDIRECTS", {"/api/health": "/somewhere"})
    response = client.get("/api/health")
    assert response.status_code != 301


def test_empty_map_disables_redirects(client, monkeypatch):
    monkeypatch.setattr(api_main, "_REDIRECTS", {})
    assert client.get("/blog/spin-ai-vs-extensionshield").status_code != 301


class TestLoadRedirects:
    """_load_redirects must fail safe and must never emit an off-origin hop."""

    def _write(self, tmp_path, monkeypatch, payload):
        (tmp_path / "redirects.json").write_text(json.dumps(payload), encoding="utf-8")
        monkeypatch.setattr(api_main, "STATIC_DIR", tmp_path)
        return api_main._load_redirects()

    def test_missing_file_returns_empty_map(self, tmp_path, monkeypatch):
        monkeypatch.setattr(api_main, "STATIC_DIR", tmp_path)
        assert api_main._load_redirects() == {}

    def test_malformed_json_returns_empty_map(self, tmp_path, monkeypatch):
        (tmp_path / "redirects.json").write_text("{not json", encoding="utf-8")
        monkeypatch.setattr(api_main, "STATIC_DIR", tmp_path)
        assert api_main._load_redirects() == {}

    def test_normalises_paths_to_leading_slash(self, tmp_path, monkeypatch):
        result = self._write(tmp_path, monkeypatch, {"/blog/old/": "/new"})
        assert result == {"/blog/old": "/new"}

    def test_rejects_off_origin_targets(self, tmp_path, monkeypatch):
        """An absolute or protocol-relative target would be an open redirect."""
        result = self._write(
            tmp_path,
            monkeypatch,
            {
                "/blog/a": "https://evil.example/x",
                "/blog/b": "//evil.example/x",
                "/blog/c": "/legit",
            },
        )
        assert result == {"/blog/c": "/legit"}

    def test_rejects_non_string_entries(self, tmp_path, monkeypatch):
        result = self._write(tmp_path, monkeypatch, {"/blog/a": 42, "/blog/b": "/ok"})
        assert result == {"/blog/b": "/ok"}


def test_shipped_redirect_map_has_no_chains():
    """Every target must be final — a 301 into another 301 dilutes the signal."""
    from pathlib import Path

    manifest = Path(__file__).resolve().parents[2] / "frontend" / "public" / "redirects.json"
    if not manifest.is_file():
        pytest.skip("redirects.json not generated (run npm run generate:sitemap)")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    sources = set(data)
    chains = {src: dst for src, dst in data.items() if dst in sources}
    assert chains == {}, f"redirect chains: {chains}"
