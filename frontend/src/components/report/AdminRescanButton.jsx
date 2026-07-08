import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import realScanService from "../../services/realScanService";

/**
 * Admin-only "Force re-scan" action for a report.
 *
 * Renders nothing unless an admin rescan token is present in localStorage
 * (`es_rescan_admin_token`). Clicking triggers a forced deep rescan of the
 * extension (bypassing the freshness cache) and navigates to the progress page.
 * The server still verifies the token against RESCAN_ADMIN_TOKEN, so this button
 * is a convenience — the real gate is server-side.
 */
const AdminRescanButton = ({ url, scanId }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Only render for admins who have set the token (server enforces the match).
  if (!realScanService.getAdminRescanToken() || !url) return null;

  const handleClick = async () => {
    setBusy(true);
    setError("");
    try {
      await realScanService.triggerScan(url, { force: true });
      navigate(`/scan/progress/${scanId}`);
    } catch (e) {
      setError(e?.message || "Force re-scan failed");
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <Button variant="outline" onClick={handleClick} disabled={busy} title="Admin: bypass cache and run a fresh deep scan">
        {busy ? "Re-scanning…" : "⟳ Force re-scan"}
      </Button>
      {error && <span style={{ color: "#EF4444", fontSize: "0.8rem" }}>{error}</span>}
    </span>
  );
};

export default AdminRescanButton;
