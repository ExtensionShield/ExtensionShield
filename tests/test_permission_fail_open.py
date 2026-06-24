"""
Regression tests for D4: the permission analyzer failed open. On any exception
during LLM analysis it set is_reasonable=True ("reasonable to avoid blocking"),
so a failed analysis was scored and rendered as verified-safe.

The fix is tri-state: True=reasonable, False=unreasonable, None=unavailable.
Unavailable is never counted as reasonable (no false-safe) and never counted as
confirmed-unreasonable (no over-flagging); the report shows it as "Unknown".
"""

from reportlab.platypus import Table

from extension_shield.core.analyzers.permissions import PermissionsAnalyzer
from extension_shield.core.report_generator import ReportGenerator
from extension_shield.governance.signal_pack import SignalPack
from extension_shield.governance.tool_adapters import PermissionsAdapter


# --- source: failed analysis is unavailable, NOT reasonable ------------------

def test_failed_permission_analysis_is_unavailable_not_reasonable(monkeypatch):
    analyzer = PermissionsAnalyzer()
    analyzer.permissions_db = {"cookies": {"description": "x", "risk_level": "high"}}

    def boom(*a, **k):
        raise RuntimeError("LLM provider unavailable")

    monkeypatch.setattr(analyzer, "_analyze_permission", boom)

    _summary, details = analyzer._analyze_permissions("Ext", "desc", ["cookies"])

    assert details["cookies"]["is_reasonable"] is None
    assert details["cookies"]["is_reasonable"] is not True  # the old false-safe
    assert details["cookies"]["status"] == "unavailable"


# --- adapter: None excluded from unreasonable; False counted -----------------

def _unreasonable_for(perm_details):
    sp = SignalPack(scan_id="t")
    PermissionsAdapter().adapt(
        {"permissions_analysis": {"permissions_details": perm_details}},
        {"permissions": list(perm_details.keys())},
        sp,
    )
    return sp.permissions.unreasonable_permissions


def test_unavailable_permission_not_counted_unreasonable():
    unreasonable = _unreasonable_for({"cookies": {"is_reasonable": None}})
    assert "cookies" not in unreasonable


def test_confirmed_unreasonable_is_counted():
    unreasonable = _unreasonable_for({"debugger": {"is_reasonable": False}})
    assert "debugger" in unreasonable


def test_reasonable_permission_not_counted():
    unreasonable = _unreasonable_for({"storage": {"is_reasonable": True}})
    assert "storage" not in unreasonable


# --- report: unavailable renders as "Unknown", never verified-safe -----------

def _perm_rows(permissions_analysis):
    elements = ReportGenerator()._create_permissions_section(permissions_analysis)
    rows = []
    for el in elements:
        if isinstance(el, Table):
            rows.extend(getattr(el, "_cellvalues", []) or [])
    return rows


def test_report_renders_unknown_for_unavailable_permission():
    rows = _perm_rows(
        {"permissions_details": {"cookies": {"is_reasonable": None}}}
    )
    cookie_row = [r for r in rows if r and r[0] == "cookies"][0]
    # Must NOT read as verified-safe ("Yes" / "Low").
    assert cookie_row[1] == "Unknown"
    assert cookie_row[1] != "Yes"
    assert cookie_row[2] != "Low"


def test_report_still_renders_yes_low_for_reasonable():
    rows = _perm_rows(
        {"permissions_details": {"storage": {"is_reasonable": True}}}
    )
    row = [r for r in rows if r and r[0] == "storage"][0]
    assert row[1] == "Yes"
    assert row[2] == "Low"
