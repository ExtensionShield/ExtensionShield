import { Navigate, useParams } from "react-router-dom";

// Redirect /extension/:id to /scan/results/:id (legacy extension route removed).
export default function RedirectExtensionToScanResults() {
  const { extensionId } = useParams();
  return <Navigate to={`/scan/results/${encodeURIComponent(extensionId || "")}`} replace />;
}
