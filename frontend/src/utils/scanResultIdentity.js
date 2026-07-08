import { normalizeExtensionId } from "./extensionId";
import { generateSlug } from "./slug";

function addIdentifier(set, value) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  set.add(trimmed);
}

/**
 * Return every stable identifier that can legitimately refer to a scan result.
 *
 * Supports:
 * - canonical extension id
 * - persisted slug / extension_slug fields
 * - slug derived from the current extension name/title
 * - an optional resolved extension id already tracked in context
 */
export function getScanResultIdentifiers(scanResult, resolvedExtensionId = null) {
  const identifiers = new Set();
  if (!scanResult || typeof scanResult !== "object") return identifiers;

  addIdentifier(identifiers, resolvedExtensionId);
  addIdentifier(identifiers, scanResult.extension_id);
  addIdentifier(identifiers, normalizeExtensionId(scanResult.extension_id || ""));
  addIdentifier(identifiers, scanResult.slug);
  addIdentifier(identifiers, scanResult.extension_slug);

  const derivedSlug = generateSlug(
    scanResult.extension_name ||
    scanResult.metadata?.title ||
    scanResult.metadata?.name ||
    ""
  );
  addIdentifier(identifiers, derivedSlug);

  return identifiers;
}

/**
 * True only when the requested route identifier genuinely refers to the same
 * loaded scan result. This must stay strict: the mere presence of a resolved
 * extension id in context must not make unrelated slug routes look cached.
 */
export function doesScanResultMatchIdentifier(scanResult, identifier, resolvedExtensionId = null) {
  if (typeof identifier !== "string" || !identifier.trim()) return false;
  return getScanResultIdentifiers(scanResult, resolvedExtensionId).has(identifier.trim());
}
