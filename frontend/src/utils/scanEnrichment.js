import databaseService from '../services/databaseService';
import { enrichScanWithSignals, SIGNAL_LEVELS } from './signalMapper';
import { extractFindingsByLayer, normalizeScanResultSafe } from './normalizeScanResult';

/**
 * Parse metadata from scan result (handles both string and object formats)
 * @param {Object} fullResult - Full scan result from database
 * @returns {Object} Parsed metadata object
 */
export function parseMetadata(fullResult) {
  let metadata = {};
  if (fullResult?.metadata) {
    if (typeof fullResult.metadata === 'string') {
      try {
        metadata = JSON.parse(fullResult.metadata);
      } catch (e) {
        metadata = fullResult.metadata;
      }
    } else {
      metadata = fullResult.metadata;
    }
  }
  return metadata;
}

function parseObjectField(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function dedupeFindings(findings) {
  const seen = new Set();
  return (Array.isArray(findings) ? findings : []).filter((finding) => {
    const key = String(finding?.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countReportFindings(rawScanResult) {
  const viewModel = normalizeScanResultSafe(rawScanResult);
  if (!viewModel) return null;

  const findingsByLayer = extractFindingsByLayer(rawScanResult);
  return ['security', 'privacy', 'governance'].reduce((total, layer) => {
    const layerFindings = [
      ...(viewModel.keyFindings?.filter((finding) => finding.layer === layer) || []),
      ...(findingsByLayer[layer] || []),
    ];
    return total + dedupeFindings(layerFindings).length;
  }, 0);
}

/**
 * Create fallback scan object when enrichment fails
 * @param {Object} scan - Basic scan object
 * @returns {Object} Fallback scan with default values
 */
export function createFallbackScan(scan) {
  return {
    ...scan,
    extension_name:
      scan.extension_name ||
      scan.extensionName ||
      scan.extension_id ||
      scan.extensionId,
    extension_id: scan.extension_id || scan.extensionId,
    timestamp: scan.timestamp,
    user_count: null,
    rating: null,
    rating_count: null,
    logo: null,
    score: scan.security_score || 0,
    risk_level: scan.risk_level || 'UNKNOWN',
    findings_count: scan.total_findings || 0,
    signals: {
      code_signal: { level: SIGNAL_LEVELS.OK, label: '—' },
      perms_signal: { level: SIGNAL_LEVELS.OK, label: '—' },
      intel_signal: { level: SIGNAL_LEVELS.OK, label: '—' },
    },
  };
}

/**
 * Enrich a single scan with full details and signals
 * @param {Object} scan - Basic scan object from history (may already include metadata)
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipFullFetch - If true, use metadata from scan and calculate signals from available data
 * @param {number} options.timeout - Timeout for individual scan fetch (ms)
 * @returns {Promise<Object>} Enriched scan object
 */
export async function enrichScan(scan, options = {}) {
  const { timeout = 3000, skipFullFetch = false } = options; // Reduced timeout for faster failures

  // If metadata is already available in scan, use it directly (avoids N+1 queries)
  const metadata = parseMetadata(scan);
  const summary = parseObjectField(scan.summary);
  // Extract risk and signals from new API mapping if available
  const riskAndSignals = scan.risk_and_signals || {};
  const riskScore = riskAndSignals.risk ?? scan.security_score ?? scan.score ?? 0;
  const totalFindings = riskAndSignals.total_findings ?? scan.total_findings ?? 0;

  // Build base scan object with available data
  const baseScan = {
    ...scan,
    extension_name:
      scan.extension_name ||
      scan.extensionName ||
      metadata?.title ||
      scan.extension_id ||
      scan.extensionId,
    extension_id: scan.extension_id || scan.extensionId,
    timestamp: scan.timestamp,
    score: riskScore,
    risk_level: scan.risk_level || 'UNKNOWN',
    findings_count: totalFindings,
    user_count: metadata?.user_count || metadata?.userCount || null,
    rating: metadata?.rating_value || metadata?.rating || null,
    rating_count:
      metadata?.rating_count ||
      metadata?.ratings_count ||
      metadata?.ratingCount ||
      null,
    logo: metadata?.logo || null,
  };

  // If skipFullFetch is true, use available data directly (even without metadata or scoring_v2)
  // This avoids N+1 queries and makes the table load much faster
  if (skipFullFetch) {
    const scanDataForSignals = {
      ...scan,
      summary,
      metadata: metadata || {},
      sast_results: scan.sast_results || metadata?.sast_results,
      permissions_analysis: scan.permissions_analysis || metadata?.permissions_analysis,
      virustotal_analysis: scan.virustotal_analysis || metadata?.virustotal_analysis || scan.virustotal_analysis,
      manifest: scan.manifest || metadata?.manifest,
      scoring_v2: scan.scoring_v2 || summary?.scoring_v2,
      report_view_model: scan.report_view_model || summary?.report_view_model,
      governance_bundle: scan.governance_bundle || summary?.governance_bundle,
    };

    // Always enrich with available data when skipFullFetch is true
    // This ensures we return a valid scan object even if metadata or scoring_v2 is missing
    const enriched = enrichScanWithSignals(baseScan, scanDataForSignals);
    const reportFindingsCount = countReportFindings(scanDataForSignals);
    return {
      ...enriched,
      findings_count: reportFindingsCount ?? enriched.findings_count,
    };
  }

  // Original behavior: fetch full result if skipFullFetch is false
  try {
    const resultPromise = databaseService.getScanResult(
      scan.extension_id || scan.extensionId
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Scan result timeout')), timeout)
    );

    const fullResult = await Promise.race([resultPromise, timeoutPromise]);
    const fullMetadata = parseMetadata(fullResult);

    // Enrich with signals from full result
    const enriched = enrichScanWithSignals(
      {
        ...baseScan,
        user_count: fullMetadata?.user_count || fullMetadata?.userCount || baseScan.user_count,
        rating: fullMetadata?.rating_value || fullMetadata?.rating || baseScan.rating,
        rating_count:
          fullMetadata?.rating_count ||
          fullMetadata?.ratings_count ||
          fullMetadata?.ratingCount ||
          baseScan.rating_count,
        logo: fullMetadata?.logo || baseScan.logo,
      },
      fullResult
    );

    const reportFindingsCount = countReportFindings(fullResult);
    return {
      ...enriched,
      findings_count: reportFindingsCount ?? enriched.findings_count,
    };
  } catch (err) {
    // If fetch fails, use what we have and create fallback
    // This ensures we always return a valid scan object, never null
    // console.warn(`Could not fetch full result for ${scan.extension_id}, using available data:`, err); // prod: no console
    const fallbackData = { metadata, ...scan };
    const enriched = enrichScanWithSignals(baseScan, fallbackData);
    const reportFindingsCount = countReportFindings(fallbackData);
    return {
      ...enriched,
      findings_count: reportFindingsCount ?? enriched.findings_count,
    };
  }
}

/**
 * Enrich multiple scans in parallel with error handling
 * Uses Promise.allSettled to prevent one failure from blocking all
 * 
 * @param {Array<Object>} scans - Array of basic scan objects (may include metadata)
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipFullFetch - If true, use metadata from scans instead of fetching (optimization)
 * @returns {Promise<Array<Object>>} Array of enriched scans
 */
export async function enrichScans(scans, options = {}) {
  if (!scans || scans.length === 0) {
    // console.warn('[enrichScans] No scans provided'); // prod: no console
    return [];
  }

  // Respect explicit skipFullFetch option, or auto-detect if metadata is available
  // If skipFullFetch is explicitly set, use it; otherwise, auto-detect based on metadata
  const enrichmentOptions = {
    ...options,
    skipFullFetch: options.skipFullFetch !== undefined 
      ? options.skipFullFetch 
      : scans.some(scan => {
          const metadata = parseMetadata(scan);
          return metadata && Object.keys(metadata).length > 0;
        }),
  };

  const enrichmentPromises = scans.map((scan) => enrichScan(scan, enrichmentOptions));
  const results = await Promise.allSettled(enrichmentPromises);
  
  const enriched = results
    .map((result, index) => {
      if (result.status === 'fulfilled') {
        // Ensure we have a valid scan object
        return result.value || createFallbackScan(scans[index]);
      } else {
        // If enrichment failed, create a fallback scan instead of filtering it out
        // This ensures the table always shows all scans, even if enrichment fails
        // console.warn(`[enrichScans] Failed to enrich scan ${index}, using fallback:`, result.reason); // prod: no console
        return createFallbackScan(scans[index]);
      }
    })
    .filter(scan => scan && scan.extension_id); // Only filter out scans without extension_id
  
  return enriched;
}
