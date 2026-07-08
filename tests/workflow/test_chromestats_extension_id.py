"""Regression: the analyzer node must carry the extension id into metadata so
ChromeStats does not log "Extension ID not provided" for Web Store scans.

Bug: extension_metadata (from the Web Store scrape) often lacks `extension_id`,
but the id IS known from the workflow state. The node now injects it before
constructing ExtensionAnalyzer.
"""
import extension_shield.workflow.nodes as nodes_mod


def test_analyzer_node_injects_extension_id_into_metadata(monkeypatch, tmp_path):
    captured = {}

    class _FakeAnalyzer:
        def __init__(self, extension_dir=None, manifest=None, metadata=None):
            captured["metadata"] = dict(metadata or {})

        def analyze(self):
            # Short-circuit the rest of the node; we only need the constructor's metadata.
            raise RuntimeError("stop-after-construct")

    monkeypatch.setattr(nodes_mod, "ExtensionAnalyzer", _FakeAnalyzer)

    state = {
        "extension_dir": str(tmp_path),
        "manifest_data": {"name": "X", "version": "1.0"},
        # Web Store metadata WITHOUT extension_id (the real gap)…
        "extension_metadata": {"title": "X"},
        # …but the id is known from the scan state.
        "extension_id": "npjilhodcgmigpladpfkkclbmkebalfd",
    }

    try:
        nodes_mod.extension_analyzer_node(state)
    except Exception:
        pass  # node continues/raises downstream; we only assert the captured metadata

    assert captured.get("metadata", {}).get("extension_id") == "npjilhodcgmigpladpfkkclbmkebalfd"


def test_analyzer_node_does_not_override_existing_extension_id(monkeypatch, tmp_path):
    captured = {}

    class _FakeAnalyzer:
        def __init__(self, extension_dir=None, manifest=None, metadata=None):
            captured["metadata"] = dict(metadata or {})

        def analyze(self):
            raise RuntimeError("stop")

    monkeypatch.setattr(nodes_mod, "ExtensionAnalyzer", _FakeAnalyzer)
    state = {
        "extension_dir": str(tmp_path),
        "manifest_data": {"name": "X"},
        "extension_metadata": {"extension_id": "already-set-id"},
        "extension_id": "different-state-id",
    }
    try:
        nodes_mod.extension_analyzer_node(state)
    except Exception:
        pass
    # setdefault must not overwrite an id the metadata already carries.
    assert captured.get("metadata", {}).get("extension_id") == "already-set-id"
