/**
 * Community service — sources the review queue from the real /api/recent
 * endpoint (dynamic: local SQLite in dev, Supabase in production). Degrades to
 * an empty list when the backend is unreachable, so callers render an honest
 * empty state rather than fabricated data.
 */
import { fetchJson } from "./requestHelpers";
import { getExtensionIconUrl } from "../utils/constants";

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

/**
 * Review queue = every recently scanned extension awaiting community review,
 * sourced from the real /api/recent endpoint (dynamic; empty when the backend
 * isn't reachable). Marking an item reviewed will persist via the Supabase
 * review tables in Phase B — for now items render as "open" (pending).
 *
 * @param {number} limit max scanned extensions to surface (default 50)
 * @returns {Promise<Array>} review items: { id, extension_id, extension_name,
 *   severity, findings_count, finding_type, status }
 */
function scanToReviewItem(scan) {
  const sev = String(scan.risk_level || "").toLowerCase();
  const severity = sev === "critical" ? "high"
    : (["high", "medium", "low"].includes(sev) ? sev : "medium");
  const findings = Number(scan.total_findings) || 0;
  const extId = scan.extension_id || "";
  return {
    id: extId || scan.slug || scan.extension_name,
    extension_id: extId,
    extension_name: scan.extension_name || extId || "Unknown extension",
    // slug drives the scan-results link (/scan/results/<slug>); icon is served
    // by the backend from the persisted scan (works for SQLite + Supabase).
    slug: scan.slug || extId,
    severity,
    finding_type: findings === 1 ? "1 finding" : `${findings} findings`,
    iconUrl: getExtensionIconUrl(extId),
  };
}

export async function getReviewQueue(limit = 100) {
  try {
    const { response, body } = await fetchJson(`${API_BASE}/recent?limit=${limit}`);
    if (!response.ok) return [];
    const list = Array.isArray(body)
      ? body
      : (Array.isArray(body?.recent) ? body.recent : []);
    return list.map(scanToReviewItem).filter((it) => it.id);
  } catch {
    return [];
  }
}
