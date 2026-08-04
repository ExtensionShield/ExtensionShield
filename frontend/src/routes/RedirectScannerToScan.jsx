import { Navigate, useParams } from "react-router-dom";

/**
 * Legacy /scanner/progress/:scanId and /scanner/results/:scanId → /scan/...
 *
 * These were previously `<Navigate to="/scan/progress/:scanId" />`. React
 * Router's `to` takes a literal path and does NOT interpolate route params, so
 * every legacy link landed on the literal URL containing ":scanId" and the scan
 * identifier was silently dropped. Reading the param and rebuilding the target
 * is the same pattern as RedirectExtensionToScanResults.
 */
export default function RedirectScannerToScan({ segment }) {
  const { scanId } = useParams();
  return <Navigate to={`/scan/${segment}/${encodeURIComponent(scanId || "")}`} replace />;
}
