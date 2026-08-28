/* ExtensionShield service worker — manages extension scanning, real-time monitoring, and security alerts */
'use strict';

var API = 'https://extensionshield.com';
var BATCH_DELAY_MS = 10000; // 6 triggers/min max; stay under API limit (VirusTotal-friendly)
var MAX_ALERTS = 50;

var DEFAULT_SETTINGS = {
  enableNotifications: true,
  alertHighRiskOnly: false,
  instantHeuristics: true
};

var DANGEROUS_PERMISSIONS = {
  '<all_urls>': 'Access to all websites and network traffic',
  '*://*/*': 'Access to all HTTP/HTTPS web traffic',
  'http://*/*': 'Access to all HTTP websites',
  'https://*/*': 'Access to all HTTPS websites',
  'cookies': 'Read and modify session authentication cookies',
  'webRequest': 'Intercept, monitor, and inspect network requests',
  'webRequestBlocking': 'Block or modify network requests and headers in flight',
  'debugger': 'Full Chrome DevTools protocol debugging access',
  'declarativeNetRequest': 'Modify network requests and traffic rules',
  'declarativeNetRequestFeedback': 'Inspect intercepted network requests',
  'nativeMessaging': 'Execute and communicate with native system applications',
  'proxy': 'Manage and redirect browser proxy network traffic',
  'privacy': 'Control browser privacy preferences and telemetry',
  'management': 'Install, disable, or modify other extensions',
  'scripting': 'Inject and execute arbitrary JavaScript across pages',
  'tabs': 'Access URLs, titles, and tabs of open browser windows',
  'history': 'Read and modify browser browsing history',
  'bookmarks': 'Read and modify browser bookmarks',
  'downloads': 'Manage and trigger file downloads'
};

var activeNotificationMap = {};

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Settings Storage */
async function getSettings() {
  var data = await chrome.storage.local.get('es_settings');
  return Object.assign({}, DEFAULT_SETTINGS, data.es_settings || {});
}

async function saveSettings(settings) {
  var updated = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  await chrome.storage.local.set({ es_settings: updated });
  return updated;
}

/* Alert History Management */
async function getAlertsHistory() {
  var data = await chrome.storage.local.get('es_alerts_history');
  return data.es_alerts_history || [];
}

async function addAlert(alert) {
  var history = await getAlertsHistory();
  var filtered = history.filter(function (a) { return a.id !== alert.id; });
  filtered.unshift(alert);
  var capped = filtered.slice(0, MAX_ALERTS);
  await chrome.storage.local.set({ es_alerts_history: capped });
  chrome.runtime.sendMessage({ type: 'ALERTS_UPDATED', alerts: capped }).catch(function () {});
  return capped;
}

async function updateAlert(alertId, updates) {
  var history = await getAlertsHistory();
  var updated = history.map(function (a) {
    if (a.id === alertId || a.extensionId === alertId) {
      return Object.assign({}, a, updates);
    }
    return a;
  });
  await chrome.storage.local.set({ es_alerts_history: updated });
  chrome.runtime.sendMessage({ type: 'ALERTS_UPDATED', alerts: updated }).catch(function () {});
  return updated;
}

async function clearAlertsHistory() {
  await chrome.storage.local.set({ es_alerts_history: [] });
  chrome.runtime.sendMessage({ type: 'ALERTS_UPDATED', alerts: [] }).catch(function () {});
  return [];
}

/* Permission Risk Heuristic Analyzer */
function analyzePermissions(permissions, hostPermissions) {
  var perms = (permissions || []).concat(hostPermissions || []);
  var detected = [];
  var riskLevel = 'LOW';

  for (var i = 0; i < perms.length; i++) {
    var p = perms[i];
    if (DANGEROUS_PERMISSIONS[p]) {
      detected.push({ permission: p, description: DANGEROUS_PERMISSIONS[p] });
    } else if (/^(https?|\*):\/\//i.test(p)) {
      detected.push({ permission: p, description: 'Broad web host permissions' });
    }
  }

  var hasAllUrls = detected.some(function (d) {
    return d.permission === '<all_urls>' || d.permission === '*://*/*' || d.permission === 'https://*/*';
  });
  var hasWebRequest = detected.some(function (d) {
    return d.permission === 'webRequest' || d.permission === 'webRequestBlocking';
  });
  var hasCookies = detected.some(function (d) { return d.permission === 'cookies'; });
  var hasDebugger = detected.some(function (d) { return d.permission === 'debugger'; });
  var hasNative = detected.some(function (d) { return d.permission === 'nativeMessaging'; });

  if (hasDebugger || hasNative || (hasAllUrls && (hasWebRequest || hasCookies))) {
    riskLevel = 'HIGH';
  } else if (detected.length >= 2 || hasAllUrls || hasWebRequest || hasCookies) {
    riskLevel = 'MEDIUM';
  } else if (detected.length > 0) {
    riskLevel = 'LOW';
  }

  return {
    isRisky: detected.length > 0,
    riskLevel: riskLevel,
    dangerousPermissions: detected
  };
}

/* Desktop Notification Handler */
function showSecurityNotification(options) {
  if (!chrome.notifications) return;
  var notifId = 'es_alert_' + options.extensionId + '_' + Date.now();
  activeNotificationMap[notifId] = {
    extensionId: options.extensionId,
    name: options.name,
    slug: options.slug,
    reportUrl: options.reportUrl
  };

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: options.iconUrl || 'icons/128.png',
    title: options.title,
    message: options.message,
    buttons: [
      { title: 'View Report' },
      { title: 'Disable Extension' }
    ],
    priority: options.priority || 2,
    requireInteraction: true
  }, function () {});
}

if (chrome.notifications && chrome.notifications.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener(async function (notifId, buttonIndex) {
    var target = activeNotificationMap[notifId];
    if (!target) return;

    if (buttonIndex === 0) {
      // View Security Report
      var reportUrl = target.reportUrl || (target.slug ? (API + '/scan/' + encodeURIComponent(target.slug)) : (API + '/scan/' + encodeURIComponent(target.extensionId)));
      chrome.tabs.create({ url: reportUrl });
    } else if (buttonIndex === 1) {
      // Disable Extension
      if (chrome.management && chrome.management.setEnabled) {
        try {
          await chrome.management.setEnabled(target.extensionId, false);
          await updateAlert(target.extensionId, { status: 'disabled' });
          chrome.notifications.create('es_disabled_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/128.png',
            title: 'Extension Disabled',
            message: target.name + ' was successfully disabled.'
          }, function () {});
        } catch (err) {
          console.error('[ExtensionShield] Failed to disable extension:', err);
        }
      }
    }
    chrome.notifications.clear(notifId, function () {});
  });
}

if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener(function (notifId) {
    var target = activeNotificationMap[notifId];
    if (!target) return;
    var reportUrl = target.reportUrl || (target.slug ? (API + '/scan/' + encodeURIComponent(target.slug)) : (API + '/scan/' + encodeURIComponent(target.extensionId)));
    chrome.tabs.create({ url: reportUrl });
    chrome.notifications.clear(notifId, function () {});
  });
}

/* Extension Management & Scanner Helpers */
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

/* Runtime Message Dispatcher */
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
      case 'getAlertsHistory':
        return await getAlertsHistory();
      case 'clearAlertsHistory':
        return await clearAlertsHistory();
      case 'getSettings':
        return await getSettings();
      case 'saveSettings':
        return await saveSettings(msg.settings);
      case 'toggleExtensionState':
        if (chrome.management && chrome.management.setEnabled) {
          await chrome.management.setEnabled(msg.extensionId, msg.enabled);
          await updateAlert(msg.extensionId, { status: msg.enabled ? 'active' : 'disabled' });
          return { success: true, enabled: msg.enabled };
        }
        return { error: 'Management permission not available' };
      default:
        return { error: 'Unknown action: ' + msg.action };
    }
  })().then(sendResponse);
  return true;
});

/* Real-Time Installation Monitoring */
chrome.management.onInstalled.addListener(async function (ext) {
  if (ext.id === chrome.runtime.id || ext.type !== 'extension') return;

  var settings = await getSettings();
  var heuristic = analyzePermissions(ext.permissions, ext.hostPermissions);

  var alertEntry = {
    id: ext.id,
    extensionId: ext.id,
    name: ext.name || ext.id,
    icon: (ext.icons && ext.icons.length > 0) ? ext.icons[ext.icons.length - 1].url : 'icons/48.png',
    timestamp: new Date().toISOString(),
    riskLevel: heuristic.riskLevel,
    permissions: heuristic.dangerousPermissions,
    status: 'scanning',
    score: null,
    slug: null
  };

  await addAlert(alertEntry);

  // Instant notification if risky permissions are detected
  if (settings.enableNotifications && settings.instantHeuristics && heuristic.isRisky && (!settings.alertHighRiskOnly || heuristic.riskLevel === 'HIGH')) {
    var permNames = heuristic.dangerousPermissions.slice(0, 3).map(function (d) { return d.permission; }).join(', ');
    showSecurityNotification({
      extensionId: ext.id,
      name: ext.name,
      title: (heuristic.riskLevel === 'HIGH' ? '⚠️ High-Risk Extension Installed' : '🛡️ ExtensionShield Alert') + ': ' + ext.name,
      message: 'Requests sensitive permissions: ' + permNames + '. Analyzing threat profile...',
      priority: heuristic.riskLevel === 'HIGH' ? 2 : 1
    });
  }

  // Trigger backend scan after short delay
  setTimeout(async function () {
    var scanResult = await scanExtension(ext.id);
    if (scanResult && scanResult.scanned) {
      var finalRisk = scanResult.riskLevel || heuristic.riskLevel;
      var finalScore = scanResult.score;

      await updateAlert(ext.id, {
        riskLevel: finalRisk,
        score: finalScore,
        findings: scanResult.findings,
        slug: scanResult.slug,
        status: 'scanned'
      });

      // Notify on High Risk completion
      if (settings.enableNotifications && (finalRisk === 'HIGH' || (typeof finalScore === 'number' && finalScore <= 50))) {
        showSecurityNotification({
          extensionId: ext.id,
          name: ext.name,
          slug: scanResult.slug,
          title: '🚨 High Threat Score Detected: ' + ext.name,
          message: 'ExtensionShield assigned a high risk rating (Score: ' + (finalScore !== null ? finalScore + '/100' : 'High Risk') + ').',
          priority: 2
        });
      }
    } else {
      await updateAlert(ext.id, { status: 'scan_failed' });
    }
  }, 3000);
});

chrome.management.onUninstalled.addListener(function (extId) {
  chrome.storage.local.remove('es_scan_' + extId);
  updateAlert(extId, { status: 'uninstalled' });
});

console.log('[ExtensionShield] Background service worker initialized with real-time monitoring');

