/* ExtensionShield service worker — manages extension scanning in background */
'use strict';

var API = 'https://extensionshield.com';
var BATCH_DELAY_MS = 10000; // 6 triggers/min max; stay under API limit (VirusTotal-friendly)

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function getAllExtensions() {
  var all = await chrome.management.getAll();
  var selfId = chrome.runtime.id;
  return all.filter(function (e) {
    if (!e.permissions) e.permissions = [];
    return e.type === 'extension' && e.id !== selfId;
  });
}

async function fetchResults(extId) {
  try {
    var res = await fetch(API + '/api/scan/results/' + encodeURIComponent(extId));
    if (res.status === 404) return { _st: 'not_found' };
    if (!res.ok) return { _st: 'error' };
    var j = await res.json();
    j._st = 'ok';
    return j;
  } catch (e) {
    return { _st: 'error' };
  }
}

async function triggerScan(extId) {
  try {
    var webstoreUrl = 'https://chromewebstore.google.com/detail/x/' + encodeURIComponent(extId);
    var res = await fetch(API + '/api/scan/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webstoreUrl })
    });
    if (!res.ok) return { status: 'error' };
    return await res.json();
  } catch (e) {
    return { status: 'error' };
  }
}

async function waitForScan(extId, maxAttempts) {
  maxAttempts = maxAttempts || 60;
  for (var i = 0; i < maxAttempts; i++) {
    await delay(3000);
    try {
      var res = await fetch(API + '/api/scan/status/' + encodeURIComponent(extId));
      if (res.ok) {
        var st = await res.json();
        if (st.status === 'completed' || st.scanned) {
          return fetchResults(extId);
        }
        if (st.status === 'error' || st.status === 'failed') {
          return { _st: 'error' };
        }
      }
    } catch (e) { /* retry */ }
  }
  return { _st: 'timeout' };
}

async function scanExtension(extId) {
  var result = await fetchResults(extId);

  if (result._st === 'not_found') {
    var trigger = await triggerScan(extId);
    if (trigger.status === 'completed' || trigger.already_scanned) {
      result = await fetchResults(extId);
    } else if (trigger.status !== 'error') {
      result = await waitForScan(extId);
    }
  }

  if (result._st === 'ok') {
    var stored = {
      extensionId: extId,
      name: result.extension_name || result.metadata && (result.metadata.title || result.metadata.name) || result.manifest && result.manifest.name || extId,
      score: extractScore(result),
      riskLevel: extractRiskLevel(result),
      findings: extractFindings(result),
      slug: result.slug || result.extension_slug,
      scanned: true,
      scanDate: new Date().toISOString()
    };
    var obj = {};
    obj['es_scan_' + extId] = stored;
    await chrome.storage.local.set(obj);
    return stored;
  }

  return { extensionId: extId, scanned: false, error: result._st };
}

function extractScore(p) {
  var r = p && p.risk_and_signals && p.risk_and_signals.risk;
  if (typeof r === 'number') return Math.max(0, Math.min(100, Math.round(r)));
  var v = p && p.scoring_v2 && p.scoring_v2.overall_score;
  if (typeof v === 'number') return Math.max(0, Math.min(100, Math.round(v)));
  var l = p && p.overall_security_score;
  if (typeof l === 'number') return Math.max(0, Math.min(100, Math.round(l)));
  return null;
}

function resolveAuthoritativeRiskLevel(p) {
  var verdict = null;
  if (p && p.final_verdict) verdict = p.final_verdict;
  else if (p && p.governance_verdict) verdict = p.governance_verdict;
  else if (p && p.governance_bundle && p.governance_bundle.decision && p.governance_bundle.decision.final_verdict) {
    verdict = p.governance_bundle.decision.final_verdict;
  } else if (p && p.scoring_v2 && p.scoring_v2.decision) {
    verdict = p.scoring_v2.decision;
  }

  var normalized = verdict && String(verdict).toUpperCase();
  if (normalized === 'BLOCK') return 'HIGH';
  if (normalized === 'NEEDS_REVIEW') return 'MEDIUM';
  return null;
}

function extractRiskLevel(p) {
  var verdictRisk = resolveAuthoritativeRiskLevel(p);
  if (verdictRisk) return verdictRisk;

  if (p && p.risk_and_signals && typeof p.risk_and_signals.risk === 'number') {
    var s = p.risk_and_signals.risk;
    if (s >= 75) return 'LOW';
    if (s >= 50) return 'MEDIUM';
    return 'HIGH';
  }
  if (p && p.scoring_v2 && p.scoring_v2.risk_level) {
    var rl = String(p.scoring_v2.risk_level).toUpperCase();
    if (rl === 'CRITICAL') return 'HIGH';
    if (rl === 'NONE') return 'LOW';
    return rl;
  }
  var lr = p && (p.overall_risk || p.risk_level);
  if (lr) {
    var u = String(lr).toUpperCase();
    if (u === 'CRITICAL') return 'HIGH';
    if (u === 'NONE') return 'LOW';
    return u;
  }
  return null;
}

function extractFindings(p) {
  var t = p && p.risk_and_signals && p.risk_and_signals.total_findings;
  if (typeof t === 'number') return t;
  t = p && p.total_findings;
  if (typeof t === 'number') return t;
  return null;
}

async function batchScan(extensionIds, delayMs) {
  delayMs = delayMs || BATCH_DELAY_MS;
  var results = [];
  for (var i = 0; i < extensionIds.length; i++) {
    if (i > 0) await delay(delayMs);
    var r = await scanExtension(extensionIds[i]);
    results.push(r);
    chrome.runtime.sendMessage({
      type: 'BATCH_SCAN_PROGRESS',
      current: i + 1,
      total: extensionIds.length,
      extensionId: extensionIds[i]
    }).catch(function () {});
  }
  chrome.runtime.sendMessage({
    type: 'BATCH_SCAN_COMPLETE',
    results: results
  }).catch(function () {});
  return results;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  (async function () {
    switch (msg.action) {
      case 'getAllExtensions':
        return await getAllExtensions();
      case 'scanExtension':
        return await scanExtension(msg.extensionId);
      case 'batchScanExtensions':
        return await batchScan(msg.extensionIds, msg.delay);
      case 'getScanResult':
        var data = await chrome.storage.local.get('es_scan_' + msg.extensionId);
        return data['es_scan_' + msg.extensionId] || null;
      default:
        return { error: 'Unknown action' };
    }
  })().then(sendResponse);
  return true;
});

chrome.management.onInstalled.addListener(function (ext) {
  if (ext.id !== chrome.runtime.id && ext.type === 'extension') {
    setTimeout(function () {
      scanExtension(ext.id);
    }, 3000);
  }
});

chrome.management.onUninstalled.addListener(function (extId) {
  chrome.storage.local.remove('es_scan_' + extId);
});

console.log('[ExtensionShield] Background service worker initialized');
