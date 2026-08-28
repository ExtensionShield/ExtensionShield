/* ExtensionShield – popup (self-contained, no service worker needed) */
(function () {
  'use strict';

  var API = 'https://extensionshield.com';
  var CACHE_TTL = 6 * 3600 * 1000;
  var WEBSTORE_URL_PREFIX = 'https://chromewebstore.google.com/detail/x/';
  var SCAN_POLL_INTERVAL = 3000;
  var SCAN_POLL_MAX = 60;
  var BATCH_DELAY_MS = 1500;

  var rows = document.getElementById('rows');
  var statusEl = document.getElementById('status');
  var statusTxt = document.getElementById('statusText');
  var errorBar = document.getElementById('errorBar');
  var extCountBadge = document.getElementById('extCountBadge');
  var appInner = document.querySelector('.app-inner');

  var themeToggle = document.getElementById('themeToggle');
  var THEME_KEY = 'es:theme';

  function applyTheme(theme) {
    var isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', isDark ? 'dark' : 'light');
  }

  function initTheme() {
    chrome.storage.local.get([THEME_KEY], function (r) {
      var theme = (r[THEME_KEY] || 'light');
      applyTheme(theme);
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var isDark = document.body.classList.contains('dark');
      var next = isDark ? 'light' : 'dark';
      chrome.storage.local.set({ [THEME_KEY]: next }, function () {
        applyTheme(next);
      });
    });
  }

  var openWebDashboardBtn = document.getElementById('openWebDashboardBtn');
  if (openWebDashboardBtn) {
    openWebDashboardBtn.addEventListener('click', function () {
      var targetUrl = 'http://localhost:5173/scan/history';
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }

  var tabExtensions = document.getElementById('tabExtensions');
  var tabAlerts = document.getElementById('tabAlerts');
  var tabScanUrl = document.getElementById('tabScanUrl');
  var paneExtensions = document.getElementById('paneExtensions');
  var paneAlerts = document.getElementById('paneAlerts');
  var paneScanUrl = document.getElementById('paneScanUrl');

  function switchTab(tabName) {
    if (appInner) appInner.setAttribute('data-tab', tabName);
    var tabs = [tabExtensions, tabAlerts, tabScanUrl];
    var panes = [paneExtensions, paneAlerts, paneScanUrl];

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i]) tabs[i].classList.remove('active');
    }
    for (var j = 0; j < panes.length; j++) {
      if (panes[j]) panes[j].classList.remove('active');
    }

    if (tabName === 'extensions') {
      if (tabExtensions) tabExtensions.classList.add('active');
      if (paneExtensions) paneExtensions.classList.add('active');
    } else if (tabName === 'alerts') {
      if (tabAlerts) tabAlerts.classList.add('active');
      if (paneAlerts) paneAlerts.classList.add('active');
      loadAlerts();
    } else if (tabName === 'scanurl') {
      if (tabScanUrl) tabScanUrl.classList.add('active');
      if (paneScanUrl) paneScanUrl.classList.add('active');
    }
  }

  if (tabExtensions) {
    tabExtensions.addEventListener('click', function () { 
      chrome.permissions.contains({ permissions: ["management"] }, function(hasPerm) {
        if (!hasPerm) {
          chrome.permissions.request({ permissions: ["management"] }, function(granted) {
            if (granted) scan(false);
          });
        }
      });
      switchTab('extensions'); 
    });
  }
  if (tabAlerts) {
    tabAlerts.addEventListener('click', function () { switchTab('alerts'); });
  }
  if (tabScanUrl) {
    tabScanUrl.addEventListener('click', function () { switchTab('scanurl'); });
  }

  var scanUrlInput = document.getElementById('scanUrlInput');
  var scanUrlSubmit = document.getElementById('scanUrlSubmit');
  var scanUrlMessage = document.getElementById('scanUrlMessage');
  var scanResultsContent = document.getElementById('scanResultsContent');
  var scanResultRows = document.getElementById('scanResultRows');
  var scanSearchContainer = document.getElementById('scanSearchContainer');

  function extractExtensionIdFromInput(value) {
    var s = (value || '').trim();
    if (!s) return null;
    var m = s.match(/chromewebstore\.google\.com\/detail\/[^/]+\/([a-z]{32})/i);
    if (m) return m[1];
    if (/^[a-z]{32}$/i.test(s)) return s;
    m = s.match(/([a-z]{32})/i);
    return m ? m[1] : null;
  }

  function setScanUrlMessage(msg, type) {
    if (!scanUrlMessage) return;
    scanUrlMessage.textContent = msg || '';
    scanUrlMessage.className = 'scan-url-message' + (type ? ' ' + type : '');
  }

  function setScanSearchLoading(loading) {
    if (scanSearchContainer) {
      if (loading) {
        scanSearchContainer.classList.add('scanning');
        if (scanUrlSubmit) scanUrlSubmit.innerHTML = '<span class="scan-btn-spinner"></span>';
      } else {
        scanSearchContainer.classList.remove('scanning');
        if (scanUrlSubmit) scanUrlSubmit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.35-4.35"></path></svg>';
      }
    }
  }

  function renderScanResult(data) {
    if (!scanResultRows || !scanResultsContent) return;
    scanResultsContent.hidden = false;
    scanResultRows.innerHTML = '';

    var tr = document.createElement('tr');
    if (data.url) {
      tr.setAttribute('data-url', data.url);
      tr.classList.add('row-clickable');
    }

    var extHtml = '<div class="ext-cell">';
    if (data.iconUrl) {
      extHtml += '<img class="ext-icon" src="' + esc(data.iconUrl) + '" alt="" width="20" height="20">';
    } else {
      extHtml += '<span class="ext-icon ext-icon-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg></span>';
    }
    extHtml += '<span class="ext-name" title="' + esc(data.name) + '">' + esc(data.name) + '</span>';
    extHtml += '</div>';

    var rLevel = data.riskLevel || 'unknown';
    var rCls = riskColorClass(rLevel);
    var rText = riskDisplayLabel(rLevel);
    var pillHtml;
    if (data.status === 'scanning') {
      pillHtml = '<span class="risk-pill r-scanning"><span class="pill-spinner"></span></span>';
    } else {
      pillHtml = '<span class="risk-pill ' + rCls + '">' + esc(rText) + '</span>';
    }

    var evHtml = '';
    if (data.status === 'scanning') {
      evHtml = '<div class="evidence-cell"><span class="scanning-text">—</span></div>';
    } else if (data.status === 'ok' && data.findings != null) {
      evHtml = '<div class="evidence-cell"><span class="finding-count">' + data.findings + ' finding' + (data.findings !== 1 ? 's' : '') + '</span></div>';
    } else {
      evHtml = '<div class="evidence-cell"><span class="finding-count">—</span></div>';
    }

    tr.innerHTML = '<td>' + extHtml + '</td><td style="text-align:center">' + pillHtml + '</td><td>' + evHtml + '</td>';
    scanResultRows.appendChild(tr);

    tr.addEventListener('click', function () {
      var url = this.getAttribute('data-url');
      if (url) chrome.tabs.create({ url: url });
    });
  }

  function handleScanUrlSubmit() {
    var raw = scanUrlInput && scanUrlInput.value ? scanUrlInput.value.trim() : '';

    if (raw) {
      var isIdOnly = /^[a-z]{32}$/i.test(raw);
      if (!isIdOnly) {
        // If not a simple ID, validate as URL
        if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
          raw = 'https://' + raw;
        }
        try {
          new URL(raw);
        } catch {
          alert("Invalid URL");
          return;
        }
      }
    }

    var extId = extractExtensionIdFromInput(raw);
    if (!extId) {
      setScanUrlMessage('Enter a Chrome Web Store URL.', 'error');
      return;
    }

    setScanUrlMessage('Scanning…', '');
    setScanSearchLoading(true);
    if (scanResultsContent) scanResultsContent.hidden = true;

    renderScanResult({
      name: extId,
      iconUrl: null,
      riskLevel: null,
      status: 'scanning',
      findings: null,
      url: API + '/scan/results/' + encodeURIComponent(extId)
    });

    fetchResults(extId).then(function (p) {
      if (p._st === 'ok') {
        var result = fromScanPayload(p, extId);
        renderScanResult(result);
        setScanUrlMessage('', '');
        setScanSearchLoading(false);
        return;
      }

      if (p._st === 'not_found') {
        setScanUrlMessage('Starting scan…', '');
        return triggerScan(extId).then(function (triggerResult) {
          if (triggerResult.status === 'error') {
            setScanUrlMessage('Could not start scan. Try on the website.', 'error');
            setScanSearchLoading(false);
            return;
          }
          if (triggerResult.status === 'completed' || triggerResult.already_scanned) {
            return fetchResults(extId).then(function (p2) {
              var result = fromScanPayload(p2, extId);
              renderScanResult(result);
              setScanUrlMessage('', '');
              setScanSearchLoading(false);
            });
          }
          setScanUrlMessage('Scan in progress…', '');
          return waitForScan(extId).then(function (p2) {
            setScanSearchLoading(false);
            if (p2._st === 'timeout') {
              setScanUrlMessage('Scan is taking longer. Check again soon.', 'error');
              renderScanResult({
                name: extId, iconUrl: null, riskLevel: null,
                status: 'timeout', findings: null,
                url: API + '/scan/progress/' + encodeURIComponent(extId)
              });
              return;
            }
            if (p2._st === 'error') {
              setScanUrlMessage('Scan failed. Try again.', 'error');
              return;
            }
            var result = fromScanPayload(p2, extId);
            renderScanResult(result);
            setScanUrlMessage('', '');
          });
        });
      }

      setScanUrlMessage('Could not fetch results.', 'error');
      setScanSearchLoading(false);
    }).catch(function () {
      setScanUrlMessage('Network error. Check your connection.', 'error');
      setScanSearchLoading(false);
    });
  }

  function fromScanPayload(p, extId) {
    var score = extractScore(p);
    var riskLevel = extractRiskLevel(p);
    if (!riskLevel && score != null) riskLevel = riskLevelFromScore(score);
    var name = (p && (p.extension_name || (p.metadata && (p.metadata.title || p.metadata.name)) || (p.manifest && p.manifest.name))) || extId;
    var iconUrl = extractIconUrl(p);
    return {
      id: extId,
      name: name,
      iconUrl: iconUrl,
      score: score,
      riskLevel: riskLevel,
      findings: extractFindings(p),
      url: extractReportUrl(p, extId),
      status: p._st || 'ok'
    };
  }

  function extractIconUrl(p) {
    if (!p) return null;
    var m = p.metadata;
    if (m) {
      if (m.icon_url) return m.icon_url;
      if (m.icon_128) return m.icon_128;
      if (m.icon_48) return m.icon_48;
      if (m.icons && m.icons.length) return m.icons[0].url || m.icons[0];
    }
    if (p.icon_url) return p.icon_url;
    if (p.icons && p.icons.length) return (p.icons[0] && p.icons[0].url) ? p.icons[0].url : p.icons[0];
    return null;
  }

  if (scanUrlSubmit) {
    scanUrlSubmit.addEventListener('click', handleScanUrlSubmit);
  }
  if (scanUrlInput) {
    scanUrlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleScanUrlSubmit();
      }
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getIconUrl(ext) {
    var icons = ext && ext.icons;
    if (!icons || !icons.length) return null;
    var url32 = null, url48 = null, urlAny = null;
    for (var i = 0; i < icons.length; i++) {
      var s = icons[i].size;
      var u = icons[i].url;
      if (!u) continue;
      if (s === 32) url32 = u;
      else if (s === 48) url48 = u;
      if (!urlAny) urlAny = u;
    }
    return url32 || url48 || urlAny;
  }

  function riskLevelFromScore(score) {
    if (score == null) return null;
    if (score >= 75) return 'LOW';
    if (score >= 50) return 'MEDIUM';
    return 'HIGH';
  }

  function riskDisplayLabel(level) {
    if (!level) return '—';
    var u = String(level).toUpperCase();
    if (u === 'LOW' || u === 'NONE') return 'Safe';
    if (u === 'MED' || u === 'MEDIUM' || u === 'MODERATE') return 'Review';
    if (u === 'HIGH' || u === 'CRITICAL') return 'Not safe';
    return level;
  }

  function riskColorClass(level) {
    if (!level) return 'r-unk';
    var u = String(level).toUpperCase();
    if (u === 'LOW' || u === 'NONE') return 'r-safe';
    if (u === 'MED' || u === 'MEDIUM') return 'r-med';
    if (u === 'HIGH' || u === 'CRITICAL') return 'r-high';
    if (u === 'MODERATE') return 'r-med';
    return 'r-unk';
  }

  var SIGNAL_THRESHOLDS = { HIGH: 49, WARN: 74 };

  function signalFromScore(score) {
    if (score == null || isNaN(score)) return { level: 'unknown', label: '—' };
    if (score <= SIGNAL_THRESHOLDS.HIGH) return { level: 'high', label: 'Not safe' };
    if (score <= SIGNAL_THRESHOLDS.WARN) return { level: 'warn', label: 'Review' };
    return { level: 'ok', label: 'Safe' };
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

  function extractSignals(p) {
    var signals = { security: null, privacy: null, gov: null };
    var ras = p && p.risk_and_signals && p.risk_and_signals.signals;
    if (ras) {
      if (typeof ras.security === 'number') signals.security = ras.security;
      if (typeof ras.privacy === 'number') signals.privacy = ras.privacy;
      if (typeof ras.gov === 'number') signals.gov = ras.gov;
      return signals;
    }
    var v2 = p && p.scoring_v2;
    if (v2) {
      if (typeof v2.security_score === 'number') signals.security = v2.security_score;
      if (typeof v2.privacy_score === 'number') signals.privacy = v2.privacy_score;
      if (typeof v2.governance_score === 'number') signals.gov = v2.governance_score;
    }
    return signals;
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
      return riskLevelFromScore(p.risk_and_signals.risk);
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
    var score = extractScore(p);
    return riskLevelFromScore(score);
  }

  function extractFindings(p) {
    var t = p && p.risk_and_signals && p.risk_and_signals.total_findings;
    if (typeof t === 'number') return t;
    t = p && p.total_findings;
    if (typeof t === 'number') return t;
    return null;
  }

  function extractReportUrl(p, extId) {
    var slug = p && (p.slug || p.extension_slug);
    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      // Generate slug from extension name for prettier URLs
      var extName = p && (p.extension_name || (p.metadata && (p.metadata.title || p.metadata.name)) || (p.manifest && p.manifest.name));
      if (extName && typeof extName === 'string' && extName.trim()) {
        slug = extName.toLowerCase()
          .replace(/[:\-–—_/\\|]+/g, '-')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
    }
    var id = (slug && typeof slug === 'string' && slug.trim()) ? slug : extId;
    return API + '/scan/results/' + encodeURIComponent(id);
  }

  function cacheKey(id, ver) { return 'es:' + id + ':' + (ver || ''); }

  function getCache(id, ver) {
    return new Promise(function (resolve) {
      var k = cacheKey(id, ver);
      chrome.storage.local.get([k], function (r) {
        if (chrome.runtime.lastError || !r[k] || !r[k].t) return resolve(null);
        if (Date.now() - r[k].t > CACHE_TTL) return resolve(null);
        resolve(r[k].d);
      });
    });
  }

  function setCache(id, ver, data) {
    var o = {}; o[cacheKey(id, ver)] = { t: Date.now(), d: data };
    chrome.storage.local.set(o);
  }

  function fetchResults(extId) {
    var url = API + '/api/scan/results/' + encodeURIComponent(extId);
    return fetch(url).then(function (res) {
      if (res.status === 404) return { _st: 'not_found' };
      if (!res.ok) return { _st: 'error' };
      return res.json().then(function (j) { j._st = 'ok'; return j; });
    }).catch(function () { return { _st: 'error' }; });
  }

  function triggerScan(extId) {
    var webstoreUrl = WEBSTORE_URL_PREFIX + encodeURIComponent(extId);
    return fetch(API + '/api/scan/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webstoreUrl })
    }).then(function (res) {
      if (!res.ok) return { status: 'error' };
      return res.json();
    }).catch(function () { return { status: 'error' }; });
  }

  function pollScanStatus(extId) {
    return fetch(API + '/api/scan/status/' + encodeURIComponent(extId))
      .then(function (res) {
        if (!res.ok) return { status: 'unknown' };
        return res.json();
      })
      .catch(function () { return { status: 'unknown' }; });
  }

  function waitForScan(extId) {
    return new Promise(function (resolve) {
      var attempts = 0;
      function check() {
        attempts++;
        if (attempts > SCAN_POLL_MAX) {
          return resolve({ _st: 'timeout' });
        }
        pollScanStatus(extId).then(function (st) {
          if (st.status === 'completed' || st.scanned) {
            fetchResults(extId).then(resolve);
          } else if (st.status === 'error' || st.status === 'failed') {
            resolve({ _st: 'error' });
          } else {
            setTimeout(check, SCAN_POLL_INTERVAL);
          }
        });
      }
      check();
    });
  }

  function processExt(ext, force, onUpdate) {
    var id = ext.id, ver = ext.version || '';
    var iconUrl = getIconUrl(ext);

    function fromPayload(p) {
      var score = extractScore(p);
      var riskLevel = extractRiskLevel(p);
      if (!riskLevel && score != null) riskLevel = riskLevelFromScore(score);
      var signals = extractSignals(p);
      return {
        id: id,
        name: ext.name || id,
        version: ver,
        iconUrl: iconUrl,
        score: score,
        riskLevel: riskLevel,
        signals: {
          security: signalFromScore(signals.security),
          privacy: signalFromScore(signals.privacy),
          governance: signalFromScore(signals.gov)
        },
        findings: extractFindings(p),
        url: extractReportUrl(p, id),
        status: p._st || 'ok'
      };
    }

    function doFetchAndMaybeScan() {
      return fetchResults(id).then(function (p) {
        if (p._st === 'not_found') {
          var scanning = fromPayload(p);
          scanning.status = 'scanning';
          if (onUpdate) onUpdate(scanning);
          return triggerScan(id).then(function (triggerResult) {
            if (triggerResult.status === 'completed' || triggerResult.already_scanned) {
              return fetchResults(id).then(function (p2) {
                var row = fromPayload(p2);
                if (row.status === 'ok') setCache(id, ver, row);
                return row;
              });
            }
            if (triggerResult.status === 'error') {
              return fromPayload({ _st: 'not_found' });
            }
            return waitForScan(id).then(function (p2) {
              var row = fromPayload(p2);
              if (row.status === 'ok') setCache(id, ver, row);
              return row;
            });
          });
        }
        var row = fromPayload(p);
        if (row.status === 'ok') setCache(id, ver, row);
        return row;
      });
    }

    if (!force) {
      return getCache(id, ver).then(function (cached) {
        if (cached) return cached;
        return doFetchAndMaybeScan();
      });
    }
    return doFetchAndMaybeScan();
  }

  function showStatus(txt) {
    statusEl.hidden = false;
    statusTxt.textContent = txt;
    errorBar.hidden = true;
  }
  function hideStatus() { statusEl.hidden = true; }
  function showError(msg) { errorBar.textContent = msg; errorBar.hidden = false; }
  function updateProgress(done, total) {
    statusTxt.textContent = 'Scanning ' + done + '/' + total + '…';
  }

  var currentData = [];
  var currentFilter = 'all';
  var currentSearchTerm = '';

  var statAllCount = document.getElementById('statAllCount');
  var statSafeCount = document.getElementById('statSafeCount');
  var statWarnCount = document.getElementById('statWarnCount');
  var statHighCount = document.getElementById('statHighCount');
  var extSearchInput = document.getElementById('extSearchInput');
  var statChips = document.querySelectorAll('.filter-pill, .stat-chip');

  if (statChips && statChips.length > 0) {
    for (var sc = 0; sc < statChips.length; sc++) {
      statChips[sc].addEventListener('click', function () {
        for (var k = 0; k < statChips.length; k++) statChips[k].classList.remove('active');
        this.classList.add('active');
        currentFilter = this.getAttribute('data-filter') || 'all';
        render(currentData);
      });
    }
  }

  if (extSearchInput) {
    extSearchInput.addEventListener('input', function () {
      currentSearchTerm = (this.value || '').trim().toLowerCase();
      render(currentData);
    });
  }

  function updateStatsCounters(data) {
    data = data || [];
    var safe = 0, warn = 0, high = 0;
    for (var i = 0; i < data.length; i++) {
      var r = (data[i].riskLevel || '').toUpperCase();
      if (r === 'LOW' || r === 'NONE') safe++;
      else if (r === 'MED' || r === 'MEDIUM' || r === 'MODERATE') warn++;
      else if (r === 'HIGH' || r === 'CRITICAL') high++;
    }
    if (statAllCount) statAllCount.textContent = String(data.length);
    if (statSafeCount) statSafeCount.textContent = String(safe);
    if (statWarnCount) statWarnCount.textContent = String(warn);
    if (statHighCount) statHighCount.textContent = String(high);
  }

  function render(data) {
    currentData = data || [];
    if (extCountBadge) extCountBadge.textContent = currentData.length + (currentData.length === 1 ? ' extension' : ' extensions');
    updateStatsCounters(currentData);

    rows.innerHTML = '';

    if (currentData.length === 0) {
      rows.innerHTML = '<div class="empty">No active extensions detected</div>';
      return;
    }

    var filtered = currentData.filter(function (d) {
      // 1. Filter by category
      if (currentFilter !== 'all') {
        var r = (d.riskLevel || '').toUpperCase();
        if (currentFilter === 'safe' && !(r === 'LOW' || r === 'NONE')) return false;
        if (currentFilter === 'warn' && !(r === 'MED' || r === 'MEDIUM' || r === 'MODERATE')) return false;
        if (currentFilter === 'high' && !(r === 'HIGH' || r === 'CRITICAL')) return false;
      }

      // 2. Filter by search query
      if (currentSearchTerm) {
        var nameMatch = (d.name || '').toLowerCase().indexOf(currentSearchTerm) !== -1;
        var idMatch = (d.id || '').toLowerCase().indexOf(currentSearchTerm) !== -1;
        if (!nameMatch && !idMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      rows.innerHTML = '<div class="empty">No extensions match your filter</div>';
      return;
    }

    var expandedExtId = null;

    for (var i = 0; i < filtered.length; i++) {
      var d = filtered[i];
      var isExpanded = expandedExtId === d.id;

      var card = document.createElement('div');
      card.className = 'ext-card-item' + (isExpanded ? ' expanded' : '');
      card.setAttribute('data-id', d.id);

      var rLevel = d.riskLevel || 'unknown';
      var rCls = riskColorClass(rLevel);
      var rText = riskDisplayLabel(rLevel);
      var pillHtml;
      if (d.status === 'scanning') {
        pillHtml = '<span class="risk-pill r-scanning"><span class="pill-spinner"></span></span>';
      } else {
        pillHtml = '<span class="risk-pill ' + rCls + '">' + esc(rText) + '</span>';
      }

      var headerHtml = '<div class="ext-card-header">' +
        '<div class="ext-card-lead">' +
          (d.iconUrl ? '<img class="ext-icon" src="' + esc(d.iconUrl) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
          '<span class="ext-name" title="' + esc(d.name) + '">' + esc(d.name) + '</span>' +
        '</div>' +
        '<div class="ext-card-meta">' +
          pillHtml +
          '<svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</div>' +
      '</div>';

      var secSig = (d.signals && d.signals.security) || { level: 'unknown', label: '—' };
      var privSig = (d.signals && d.signals.privacy) || { level: 'unknown', label: '—' };
      var govSig = (d.signals && d.signals.governance) || { level: 'unknown', label: '—' };

      function sigBoxClass(lvl) {
        if (lvl === 'ok') return 'sig-safe';
        if (lvl === 'warn') return 'sig-warn';
        if (lvl === 'high') return 'sig-high';
        return 'sig-unk';
      }

      var signalsHtml = '<div class="ext-signals-grid">' +
        '<div class="signal-box ' + sigBoxClass(secSig.level) + '">' +
          '<span class="signal-box-title">Security</span>' +
          '<span class="signal-box-status">' + esc(secSig.label) + '</span>' +
        '</div>' +
        '<div class="signal-box ' + sigBoxClass(privSig.level) + '">' +
          '<span class="signal-box-title">Privacy</span>' +
          '<span class="signal-box-status">' + esc(privSig.label) + '</span>' +
        '</div>' +
        '<div class="signal-box ' + sigBoxClass(govSig.level) + '">' +
          '<span class="signal-box-title">Governance</span>' +
          '<span class="signal-box-status">' + esc(govSig.label) + '</span>' +
        '</div>' +
      '</div>';

      var findingsText = (d.findings != null) ? (d.findings + ' finding' + (d.findings !== 1 ? 's' : '')) : 'Scan pending';
      var scoreText = (d.score != null) ? ('Score: ' + d.score + '/100') : '—';

      var summaryRow = '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text3); padding:0 2px;">' +
        '<span>' + esc(findingsText) + '</span>' +
        '<span>' + esc(scoreText) + '</span>' +
      '</div>';

      var reportUrl = d.url || (API + '/scan/' + encodeURIComponent(d.id));
      var actionsHtml = '<div class="ext-actions-bar">' +
        '<a href="' + reportUrl + '" target="_blank" rel="noopener noreferrer" class="alert-btn alert-btn-report">View Full Report ↗</a>' +
        '<button type="button" class="alert-btn alert-btn-disable" data-extid="' + d.id + '">Disable</button>' +
      '</div>';

      var detailsHtml = '<div class="ext-card-details"' + (isExpanded ? '' : ' hidden') + '>' +
        signalsHtml +
        summaryRow +
        actionsHtml +
      '</div>';

      card.innerHTML = headerHtml + detailsHtml;

      // Header click handler for accordion toggle with auto-collapse
      (function (extId, currentCard) {
        var headerEl = currentCard.querySelector('.ext-card-header');
        if (headerEl) {
          headerEl.addEventListener('click', function () {
            var detailsEl = currentCard.querySelector('.ext-card-details');
            var isNowExpanded = currentCard.classList.contains('expanded');

            // Auto-collapse any other open card
            var allCards = rows.querySelectorAll('.ext-card-item');
            for (var c = 0; c < allCards.length; c++) {
              allCards[c].classList.remove('expanded');
              var dEl = allCards[c].querySelector('.ext-card-details');
              if (dEl) dEl.hidden = true;
            }

            if (!isNowExpanded) {
              currentCard.classList.add('expanded');
              if (detailsEl) detailsEl.hidden = false;
            }
          });
        }

        var disableBtn = currentCard.querySelector('button[data-extid]');
        if (disableBtn) {
          disableBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            disableBtn.disabled = true;
            disableBtn.textContent = 'Disabling…';
            chrome.runtime.sendMessage({
              action: 'toggleExtensionState',
              extensionId: extId,
              enabled: false
            }, function () {
              scan(false);
            });
          });
        }
      })(d.id, card);

      rows.appendChild(card);
    }
  }

  function scan(force) {
    chrome.permissions.contains({ permissions: ["management"] }, function(hasPerm) {
      if (!hasPerm) {
        showError("Management permission required. Click Extensions tab to grant.");
        render([]);
        return;
      }

      showStatus('Getting extensions…');

      chrome.runtime.sendMessage({ action: 'getAllExtensions' }, function (all) {
        if (chrome.runtime.lastError || !all) {
          chrome.management.getAll(function (fallbackAll) {
            if (chrome.runtime.lastError) {
              hideStatus();
              showError('Cannot access extensions: ' + (chrome.runtime.lastError.message || 'unknown'));
              return;
            }
            var selfId = chrome.runtime.id;
            var filtered = [];
            for (var j = 0; j < fallbackAll.length; j++) {
              if (!fallbackAll[j].permissions) fallbackAll[j].permissions = [];
              if (fallbackAll[j].type === 'extension' && fallbackAll[j].id !== selfId && fallbackAll[j].enabled) filtered.push(fallbackAll[j]);
            }
            runScanWithExtensions(filtered, force);
          });
          return;
        }

        var exts = [];
        for (var i = 0; i < all.length; i++) {
          if (!all[i].permissions) all[i].permissions = [];
          if (all[i].enabled) exts.push(all[i]);
        }
        runScanWithExtensions(exts, force);
      });
    });
  }

  function runScanWithExtensions(exts, force) {
    if (!exts || exts.length === 0) {
      hideStatus();
      render([]);
      return;
    }

      showStatus('Scanning 0/' + exts.length + '…');

      var results = [];
      for (var k = 0; k < exts.length; k++) {
        results.push({
          id: exts[k].id,
          name: exts[k].name || exts[k].id,
          version: exts[k].version || '',
          iconUrl: getIconUrl(exts[k]),
          score: null,
          riskLevel: null,
          signals: {
            security: { level: 'unknown', label: '—' },
            privacy: { level: 'unknown', label: '—' },
            governance: { level: 'unknown', label: '—' }
          },
          findings: null,
          url: API + '/scan/results/' + encodeURIComponent(exts[k].id),
          status: 'scanning'
        });
      }
      render(results);

      var idx = 0;
      function nextExt() {
        if (idx >= exts.length) {
          results.sort(function (a, b) {
            if (a.status === 'scanning') return 1;
            if (b.status === 'scanning') return -1;
            if (a.score == null && b.score == null) return 0;
            if (a.score == null) return 1;
            if (b.score == null) return -1;
            return b.score - a.score;
          });
          hideStatus();
          render(results);
          return;
        }

        var ext = exts[idx];
        var extIdx = idx;
        idx++;
        updateProgress(extIdx, exts.length);

        processExt(ext, !!force, function onScanUpdate(partial) {
          results[extIdx] = partial;
          render(results);
        }).then(function (row) {
          results[extIdx] = row;
          render(results);
          updateProgress(extIdx + 1, exts.length);
          return delay(BATCH_DELAY_MS);
        }).then(function () {
          nextExt();
        }).catch(function () {
          results[extIdx] = {
            id: ext.id, name: ext.name || ext.id, version: ext.version || '',
            iconUrl: getIconUrl(ext),
            score: null, riskLevel: null,
            signals: {
              security: { level: 'unknown', label: '—' },
              privacy: { level: 'unknown', label: '—' },
              governance: { level: 'unknown', label: '—' }
            },
            findings: null,
            url: API + '/scan/results/' + encodeURIComponent(ext.id),
            status: 'error'
          };
          render(results);
          delay(BATCH_DELAY_MS).then(function () { nextExt(); });
        });
      }

      nextExt();
  }

  /* ─── Security Alerts & Settings Logic ─── */
  var alertsBadge = document.getElementById('alertsBadge');
  var alertsSettingsToggle = document.getElementById('alertsSettingsToggle');
  var alertsClearBtn = document.getElementById('alertsClearBtn');
  var alertsSettingsDrawer = document.getElementById('alertsSettingsDrawer');
  var settingEnableNotifs = document.getElementById('settingEnableNotifs');
  var settingHighRiskOnly = document.getElementById('settingHighRiskOnly');
  var settingInstantHeuristics = document.getElementById('settingInstantHeuristics');
  var alertsList = document.getElementById('alertsList');
  var alertsEmptyState = document.getElementById('alertsEmptyState');

  function formatTimeAgo(isoString) {
    if (!isoString) return '';
    var date = new Date(isoString);
    var now = new Date();
    var diffMs = now - date;
    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHr = Math.floor(diffMin / 60);
    var diffDays = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return diffMin + 'm ago';
    if (diffHr < 24) return diffHr + 'h ago';
    if (diffDays === 1) return 'Yesterday';
    return diffDays + 'd ago';
  }

  function renderRiskBadge(rLevel, score, isScanning) {
    if (isScanning) {
      return '<span class="risk-pill r-scanning"><span class="pill-spinner"></span></span>';
    }
    var lvl = rLevel || (score != null ? riskLevelFromScore(score) : 'unknown');
    var cls = riskColorClass(lvl);
    var label = riskDisplayLabel(lvl);
    return '<span class="risk-pill ' + cls + '">' + esc(label) + '</span>';
  }

  function initAlertSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (settings) {
      if (!settings) return;
      if (settingEnableNotifs) settingEnableNotifs.checked = !!settings.enableNotifications;
      if (settingHighRiskOnly) settingHighRiskOnly.checked = !!settings.alertHighRiskOnly;
      if (settingInstantHeuristics) settingInstantHeuristics.checked = !!settings.instantHeuristics;
    });

    if (alertsSettingsToggle && alertsSettingsDrawer) {
      alertsSettingsToggle.addEventListener('click', function () {
        alertsSettingsDrawer.hidden = !alertsSettingsDrawer.hidden;
      });
    }

    function onSettingChange() {
      var updated = {
        enableNotifications: settingEnableNotifs ? settingEnableNotifs.checked : true,
        alertHighRiskOnly: settingHighRiskOnly ? settingHighRiskOnly.checked : false,
        instantHeuristics: settingInstantHeuristics ? settingInstantHeuristics.checked : true
      };
      chrome.runtime.sendMessage({ action: 'saveSettings', settings: updated });
    }

    if (settingEnableNotifs) settingEnableNotifs.addEventListener('change', onSettingChange);
    if (settingHighRiskOnly) settingHighRiskOnly.addEventListener('change', onSettingChange);
    if (settingInstantHeuristics) settingInstantHeuristics.addEventListener('change', onSettingChange);

    if (alertsClearBtn) {
      alertsClearBtn.addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'clearAlertsHistory' }, function () {
          renderAlerts([]);
        });
      });
    }
  }

  function renderAlerts(alerts) {
    if (!alertsList || !alertsEmptyState) return;
    alerts = alerts || [];

    var highRiskCount = alerts.filter(function (a) {
      return (a.riskLevel === 'HIGH' || a.status === 'scanning') && a.status !== 'disabled';
    }).length;

    if (alertsBadge) {
      if (highRiskCount > 0) {
        alertsBadge.textContent = String(highRiskCount);
        alertsBadge.hidden = false;
      } else {
        alertsBadge.hidden = true;
      }
    }

    if (alerts.length === 0) {
      alertsList.innerHTML = '';
      alertsList.hidden = true;
      alertsEmptyState.hidden = false;
      return;
    }

    alertsEmptyState.hidden = true;
    alertsList.hidden = false;
    alertsList.innerHTML = '';

    for (var i = 0; i < alerts.length; i++) {
      var item = alerts[i];
      var card = document.createElement('div');
      var riskClass = 'alert-low';
      if (item.riskLevel === 'HIGH') riskClass = 'alert-high';
      else if (item.riskLevel === 'MEDIUM') riskClass = 'alert-medium';

      card.className = 'alert-card ' + riskClass;

      var headerHtml = '<div class="alert-card-top">' +
        '<div class="alert-card-ext">' +
          '<img class="alert-ext-icon" src="' + (item.icon || 'icons/48.png') + '" alt="" onerror="this.src=\'icons/48.png\'">' +
          '<div class="alert-ext-info">' +
            '<span class="alert-ext-name" title="' + esc(item.name) + '">' + esc(item.name) + '</span>' +
            '<span class="alert-time">' + formatTimeAgo(item.timestamp) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="alert-badge-wrap">' +
          renderRiskBadge(item.riskLevel, item.score, item.status === 'scanning') +
        '</div>' +
      '</div>';

      var permsHtml = '';
      if (item.permissions && item.permissions.length > 0) {
        permsHtml += '<div class="alert-perms">';
        for (var p = 0; p < Math.min(item.permissions.length, 4); p++) {
          var pName = item.permissions[p].permission || item.permissions[p];
          permsHtml += '<span class="alert-perm-chip" title="' + esc(item.permissions[p].description || pName) + '">' + esc(pName) + '</span>';
        }
        if (item.permissions.length > 4) {
          permsHtml += '<span class="alert-perm-chip">+' + (item.permissions.length - 4) + ' more</span>';
        }
        permsHtml += '</div>';
      }

      var reportUrl = item.slug ? (API + '/scan/' + encodeURIComponent(item.slug)) : (API + '/scan/' + encodeURIComponent(item.extensionId));
      var isDisabled = item.status === 'disabled';

      var actionsHtml = '<div class="alert-card-actions">' +
        '<a href="' + reportUrl + '" target="_blank" rel="noopener noreferrer" class="alert-btn alert-btn-report">View Report ↗</a>' +
        '<button type="button" class="alert-btn ' + (isDisabled ? 'alert-btn-enable' : 'alert-btn-disable') + '" data-extid="' + item.extensionId + '" data-action="' + (isDisabled ? 'enable' : 'disable') + '">' +
          (isDisabled ? 'Enable Extension' : 'Disable Extension') +
        '</button>' +
      '</div>';

      card.innerHTML = headerHtml + permsHtml + actionsHtml;

      var toggleBtn = card.querySelector('button[data-extid]');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (function (btn, extId, currentAction) {
          return function () {
            var enable = currentAction === 'enable';
            btn.disabled = true;
            btn.textContent = 'Updating…';
            chrome.runtime.sendMessage({
              action: 'toggleExtensionState',
              extensionId: extId,
              enabled: enable
            }, function (res) {
              if (res && res.success) {
                loadAlerts();
              } else {
                btn.disabled = false;
                btn.textContent = enable ? 'Enable Extension' : 'Disable Extension';
              }
            });
          };
        })(toggleBtn, item.extensionId, isDisabled ? 'enable' : 'disable'));
      }

      alertsList.appendChild(card);
    }
  }

  function loadAlerts() {
    chrome.runtime.sendMessage({ action: 'getAlertsHistory' }, function (alerts) {
      renderAlerts(alerts || []);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'ALERTS_UPDATED') {
      renderAlerts(msg.alerts);
    }
  });

  initTheme();
  initAlertSettings();
  loadAlerts();
  scan(false);
})();
