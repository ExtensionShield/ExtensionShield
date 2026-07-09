import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Code2,
  FileJson2,
  Globe2,
  Network,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import { toRelativeEvidencePath } from '../../utils/normalizeScanResult';
import { resolveAnalyzerCoverage } from '../../utils/reportDisplay';
import './EvidenceTechnicalDetails.scss';

const TABS = [
  { key: 'permissions', label: 'Permissions', Icon: ShieldCheck },
  { key: 'manifest', label: 'Manifest', Icon: FileJson2 },
  { key: 'code', label: 'Code/SAST', Icon: Code2 },
  { key: 'network', label: 'Network', Icon: Network },
  { key: 'virustotal', label: 'VirusTotal', Icon: Globe2 },
  { key: 'governance', label: 'Governance', Icon: ScrollText },
  { key: 'coverage', label: 'Coverage', Icon: SlidersHorizontal },
];

const ANALYZER_ICON = {
  sast: Code2,
  virustotal: ShieldCheck,
  listing: Store,
  chromestats: BarChart3,
};

const LOCAL_PATH_RE = /(?:\/Users\/|\/home\/|\b[A-Za-z]:\/(?!\/)|extensions_storage\/|extracted_[^/\s]+\/)\S+/g;
const HIGH_RISK_PERMISSIONS = new Set(['cookies', 'debugger', 'downloads', 'history', 'management', 'nativeMessaging', 'proxy', 'webRequest', 'webRequestBlocking']);
const MEDIUM_RISK_PERMISSIONS = new Set(['tabs', 'webNavigation', 'activeTab', 'scripting', 'clipboardRead', 'clipboardWrite', 'identity', 'tabCapture', 'desktopCapture']);

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(LOCAL_PATH_RE, (match) => toRelativeEvidencePath(match));
}

function cleanPath(value) {
  return cleanText(toRelativeEvidencePath(value));
}

function compactList(items, limit = 3) {
  const clean = asArray(items).map(cleanText).filter(Boolean);
  if (!clean.length) return 'Not declared';
  const head = clean.slice(0, limit).join(', ');
  const extra = clean.length > limit ? ` +${clean.length - limit} more` : '';
  return `${head}${extra}`;
}

function severityTone(value) {
  const s = String(value || '').toLowerCase();
  if (['critical', 'error', 'high', 'block', 'blocked', 'fail', 'failed', 'malicious'].includes(s)) return 'bad';
  if (['medium', 'warning', 'warn', 'review', 'needs_review', 'partial', 'caution', 'suspicious'].includes(s)) return 'warn';
  if (['low', 'info', 'clean', 'pass', 'passed', 'allow', 'full', 'scanned', 'ok'].includes(s)) return 'good';
  return 'neutral';
}

function Pill({ children, tone = 'neutral' }) {
  return <span className={`etd-pill tone-${tone}`}>{children}</span>;
}

function EmptyState({ children = 'No evidence was included for this group in the scan payload.' }) {
  return (
    <div className="etd-empty">
      <CheckCircle2 size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function permissionExplanation(name, type) {
  if (type === 'Host') {
    return String(name).includes('<all_urls>') || String(name).includes('*://*/*')
      ? 'Allows access to all matching web pages. This broad capability increases review scope, but is not proof of misuse.'
      : 'Allows access to pages matching this host pattern.';
  }
  const lower = String(name).toLowerCase();
  const explanations = {
    tabs: 'Read browser tab metadata and interact with tab state.',
    storage: 'Store and retrieve extension data locally.',
    cookies: 'Read or modify browser cookies where allowed.',
    webnavigation: 'Observe browser navigation events.',
    webrequest: 'Observe or intercept network requests.',
    webrequestblocking: 'Block or modify network requests.',
    scripting: 'Inject scripts into allowed pages.',
    activetab: 'Access the active tab after user interaction.',
    tabcapture: 'Capture audio or video from a browser tab when the extension invokes the capture flow.',
    desktopcapture: 'Request capture of a screen, window, or tab through Chrome’s desktop capture flow.',
    debugger: 'Attach to a browser target through the DevTools protocol. Powerful capability; review whether it matches the extension purpose.',
    history: 'Read browsing history.',
    downloads: 'Manage browser downloads.',
  };
  return explanations[lower] || 'Requested browser capability declared by the extension.';
}

function permissionRisk(name, type, permissionsVm) {
  const highRisk = new Set([...(permissionsVm?.highRiskPermissions || []), ...(permissionsVm?.unreasonablePermissions || []), ...(permissionsVm?.broadHostPatterns || [])]);
  if (highRisk.has(name)) return 'High';
  if (type === 'Host') {
    return String(name).includes('<all_urls>') || String(name).includes('*://*/*') ? 'High' : 'Medium';
  }
  if (HIGH_RISK_PERMISSIONS.has(name)) return 'High';
  if (MEDIUM_RISK_PERMISSIONS.has(name)) return 'Medium';
  return 'Low';
}

function buildPermissionsRows(viewModel) {
  const permissions = viewModel?.permissions || {};
  const apiRows = (permissions.apiPermissions || []).map((name) => {
    const risk = permissionRisk(name, 'API', permissions);
    return {
      id: `api:${name}`,
      name: cleanText(name),
      type: 'API',
      risk,
      why: permissionExplanation(name, 'API'),
      source: 'manifest.json',
    };
  });
  const hostRows = (permissions.hostPermissions || []).map((name) => {
    const risk = permissionRisk(name, 'Host', permissions);
    return {
      id: `host:${name}`,
      name: cleanText(name),
      type: 'Host',
      risk,
      why: permissionExplanation(name, 'Host'),
      source: 'manifest.json',
    };
  });
  return [...apiRows, ...hostRows];
}

function getManifest(raw) {
  return raw?.manifest || raw?.governance_bundle?.facts?.manifest || raw?.governance_bundle?.signal_pack?.manifest || {};
}

function buildManifestRows(raw) {
  const manifest = getManifest(raw);
  if (!manifest || !Object.keys(manifest).length) return [];
  const csp = manifest.content_security_policy;
  return [
    { id: 'manifest-version', label: 'Manifest version', value: manifest.manifest_version ? `Manifest V${manifest.manifest_version}` : 'Not declared', status: manifest.manifest_version ? 'Present' : 'Missing' },
    { id: 'csp', label: 'Content Security Policy', value: csp ? cleanText(typeof csp === 'string' ? csp : JSON.stringify(csp)) : 'Not declared', status: csp ? 'Present' : 'Missing' },
    { id: 'host-permissions', label: 'Host permissions', value: compactList(manifest.host_permissions), status: `${asArray(manifest.host_permissions).length}` },
    { id: 'optional-permissions', label: 'Optional permissions', value: compactList(manifest.optional_permissions), status: `${asArray(manifest.optional_permissions).length}` },
    {
      id: 'content-scripts',
      label: 'Content scripts',
      value: asArray(manifest.content_scripts).length
        ? asArray(manifest.content_scripts).map((script) => `${compactList(script.matches, 2)} -> ${compactList(script.js, 2)}`).join('; ')
        : 'Not declared',
      status: `${asArray(manifest.content_scripts).length}`,
    },
    { id: 'web-accessible', label: 'Web accessible resources', value: compactList(manifest.web_accessible_resources?.flatMap?.((r) => r.resources || r.matches || r) || manifest.web_accessible_resources), status: `${asArray(manifest.web_accessible_resources).length}` },
    { id: 'externally-connectable', label: 'Externally connectable', value: manifest.externally_connectable ? cleanText(JSON.stringify(manifest.externally_connectable)) : 'Not declared', status: manifest.externally_connectable ? 'Present' : 'None' },
  ];
}

function extractSastRows(raw, viewModel) {
  const rows = [];
  const sast = raw?.sast_results || raw?.governance_bundle?.signal_pack?.sast || {};
  const findings = sast.sast_findings || sast.sastFindings || {};
  if (findings && typeof findings === 'object' && !Array.isArray(findings)) {
    Object.entries(findings).forEach(([filePath, fileFindings]) => {
      asArray(fileFindings).forEach((finding, index) => {
        const extra = finding?.extra || {};
        const path = cleanPath(finding?.path || filePath);
        rows.push({
          id: `sast:${filePath}:${index}`,
          rule: cleanText(finding?.check_id || extra.message || 'SAST finding'),
          severity: cleanText(extra.severity || finding?.severity || 'Info'),
          file: path || 'File not provided',
          line: finding?.start?.line || finding?.line_number || null,
          endLine: finding?.end?.line || null,
          snippet: cleanText(extra.lines || finding?.code_snippet || ''),
        });
      });
    });
  }

  Object.entries(viewModel?.evidenceIndex || {}).forEach(([id, evidence]) => {
    if (!evidence?.filePath || !String(evidence.toolName || '').toLowerCase().includes('sast')) return;
    if (rows.some((row) => row.file === cleanPath(evidence.filePath) && row.line === evidence.lineStart)) return;
    rows.push({
      id: `evidence:${id}`,
      rule: cleanText(evidence.toolName || 'SAST evidence'),
      severity: 'Info',
      file: cleanPath(evidence.filePath),
      line: evidence.lineStart || null,
      endLine: evidence.lineEnd || null,
      snippet: cleanText(evidence.snippet || ''),
    });
  });

  return rows;
}

function extractNetworkRows(raw, viewModel) {
  const rows = [];
  const candidates = [
    raw?.network_analysis?.domains,
    raw?.network_analysis?.urls,
    raw?.network_analysis?.endpoints,
    raw?.network_analysis?.requests,
    raw?.network_results?.domains,
    raw?.network_results?.urls,
    raw?.network_results?.endpoints,
    raw?.network_evidence?.domains,
    raw?.network_evidence?.urls,
  ].flatMap(asArray);

  candidates.forEach((entry, index) => {
    const target = typeof entry === 'string' ? entry : (entry?.domain || entry?.url || entry?.endpoint || entry?.host);
    if (!target) return;
    rows.push({
      id: `network:${index}`,
      target: cleanText(target),
      kind: cleanText(typeof entry === 'string' ? 'Observed endpoint' : (entry.type || entry.kind || 'Observed endpoint')),
      status: 'Observed',
      evidence: cleanText(typeof entry === 'string' ? '' : (entry.reason || entry.source || entry.sink || entry.file || '')),
    });
  });

  if (!rows.length) {
    const hosts = viewModel?.permissions?.hostPermissions || [];
    hosts.slice(0, 8).forEach((host, index) => {
      rows.push({
        id: `network-capability:${index}`,
        target: cleanText(host),
        kind: 'Capability',
        status: 'Declared access',
        evidence: 'Host permission capability; not proof of network exfiltration.',
      });
    });
  }

  return rows;
}

function extractVirusTotalRows(raw) {
  const vt = raw?.virustotal_analysis || {};
  const fileRows = asArray(vt.file_results).map((file, index) => {
    const stats = file?.virustotal?.detection_stats || {};
    const malicious = stats.malicious ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const total = stats.total_engines ?? (
      typeof stats.harmless === 'number' || typeof stats.undetected === 'number'
        ? (stats.harmless || 0) + (stats.undetected || 0) + malicious + suspicious
        : null
    );
    return {
      id: `vt:${index}`,
      file: cleanPath(file.file_path || file.file_name) || 'File not provided',
      hash: cleanText(file.hashes?.sha256 || file.virustotal?.sha256 || file.hash || ''),
      status: file.virustotal?.found === false ? 'Not in VirusTotal' : (malicious > 0 ? 'Detected' : 'No detections'),
      malicious,
      suspicious,
      total,
    };
  });
  return {
    summary: {
      enabled: vt.enabled,
      filesAnalyzed: vt.files_analyzed,
      filesFound: vt.files_found_in_vt,
      filesWithDetections: vt.files_with_detections,
      malicious: vt.total_malicious,
      suspicious: vt.total_suspicious,
      threat: vt.summary?.threat_level,
    },
    rows: fileRows,
  };
}

function extractGovernanceRows(raw) {
  const bundle = raw?.governance_bundle || {};
  const ruleResults = [
    ...asArray(bundle.rule_results?.rule_results),
    ...asArray(bundle.report?.rule_results),
    ...asArray(raw?.rule_results?.rule_results),
    ...asArray(raw?.rule_results),
  ];
  const rows = ruleResults
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule, index) => ({
      id: `gov:${rule.rulepack || 'rule'}:${rule.rule_id || index}`,
      rulepack: cleanText(rule.rulepack || 'Governance'),
      ruleId: cleanText(rule.rule_id || rule.id || 'Rule'),
      verdict: cleanText(rule.verdict || 'Review'),
      reason: cleanText(rule.explanation || rule.reason || ''),
      action: cleanText(rule.recommended_action || rule.action_required || ''),
    }));

  const decision = bundle.decision || bundle.report?.decision || raw?.decision;
  if (!rows.length && decision) {
    rows.push({
      id: 'gov:decision',
      rulepack: cleanText(decision.final_authority || 'Decision'),
      ruleId: cleanText(decision.final_verdict || decision.verdict || 'Final verdict'),
      verdict: cleanText(decision.final_verdict || decision.verdict || 'Review'),
      reason: cleanText(asArray(decision.final_reasons)[0] || decision.rationale || ''),
      action: cleanText(decision.action_required || ''),
    });
  }
  return rows;
}

function buildCounts(data) {
  return {
    permissions: data.permissions.length,
    manifest: data.manifest.filter((row) => row.value && row.value !== 'Not declared').length,
    code: data.code.length,
    network: data.network.length,
    virustotal: data.virustotal.rows.length || (data.virustotal.summary.enabled !== undefined ? 1 : 0),
    governance: data.governance.length,
    coverage: data.coverage.length,
  };
}

function EvidenceTechnicalDetails({ rawScanResult, viewModel }) {
  const [activeTab, setActiveTab] = useState('permissions');
  const data = useMemo(() => {
    const raw = rawScanResult || {};
    const vm = viewModel || {};
    const coverage = resolveAnalyzerCoverage(raw);
    return {
      permissions: buildPermissionsRows(vm),
      manifest: buildManifestRows(raw),
      code: extractSastRows(raw, vm),
      codeStatus: coverage.find((row) => row.key === 'sast') || null,
      network: extractNetworkRows(raw, vm),
      virustotal: extractVirusTotalRows(raw),
      governance: extractGovernanceRows(raw),
      coverage,
    };
  }, [rawScanResult, viewModel]);
  const counts = buildCounts(data);

  return (
    <section className="evidence-technical-details" id="evidence-technical-details" aria-labelledby="evidence-technical-details-heading">
      <div className="etd-head">
        <div>
          <h2 id="evidence-technical-details-heading" className="etd-title">Evidence &amp; Technical Details</h2>
          <p className="etd-sub">Scan inputs and analyzer outputs used to support the report.</p>
        </div>
      </div>

      <div className="etd-tabs" role="tablist" aria-label="Evidence detail groups">
        {TABS.map(({ key, label, Icon }) => (
          <button
            type="button"
            key={key}
            className={`etd-tab${activeTab === key ? ' is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`etd-panel-${key}`}
            id={`etd-tab-${key}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
            <span className="etd-tab-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="etd-panel" id={`etd-panel-${activeTab}`} role="tabpanel" aria-labelledby={`etd-tab-${activeTab}`}>
        {activeTab === 'permissions' && <PermissionsPanel rows={data.permissions} />}
        {activeTab === 'manifest' && <ManifestPanel rows={data.manifest} />}
        {activeTab === 'code' && <CodePanel rows={data.code} status={data.codeStatus} />}
        {activeTab === 'network' && <NetworkPanel rows={data.network} />}
        {activeTab === 'virustotal' && <VirusTotalPanel summary={data.virustotal.summary} rows={data.virustotal.rows} />}
        {activeTab === 'governance' && <GovernancePanel rows={data.governance} />}
        {activeTab === 'coverage' && <CoveragePanel rows={data.coverage} />}
      </div>
    </section>
  );
}

function PermissionsPanel({ rows }) {
  if (!rows.length) return <EmptyState>No permissions were included in the normalized report.</EmptyState>;
  return (
    <div className="etd-table etd-permissions" role="table" aria-label="Declared permissions">
      <div className="etd-row etd-row-head" role="row">
        <span role="columnheader">Permission</span><span role="columnheader">Type</span><span role="columnheader">Risk</span><span role="columnheader">Why it matters</span><span role="columnheader">Source</span>
      </div>
      {rows.map((row) => (
        <div className="etd-row" role="row" key={row.id}>
          <span role="cell" className="etd-strong">{row.name}</span>
          <span role="cell">{row.type}</span>
          <span role="cell"><Pill tone={severityTone(row.risk)}>{row.risk}</Pill></span>
          <span role="cell">{row.why}</span>
          <span role="cell" className="etd-muted">{row.source}</span>
        </div>
      ))}
    </div>
  );
}

function ManifestPanel({ rows }) {
  if (!rows.length) return <EmptyState>No manifest details were included in the scan payload.</EmptyState>;
  return (
    <div className="etd-key-list">
      {rows.map((row) => (
        <div className="etd-key-row" key={row.id}>
          <span className="etd-key">{row.label}</span>
          <span className="etd-value">{row.value}</span>
          <Pill tone={severityTone(row.status === 'Missing' ? 'warn' : 'good')}>{row.status}</Pill>
        </div>
      ))}
    </div>
  );
}

function CodePanel({ rows, status }) {
  if (!rows.length) {
    let message = 'No SAST findings or code evidence were included in the scan payload.';
    if (status?.state === 'failed') {
      message = 'Code/SAST did not complete. No SAST findings are available from this scan.';
    } else if (status?.state === 'no_code_scanned') {
      message = 'Code/SAST analyzed 0 files. The extension code was not statically analyzed; this is not a clean result.';
    } else if (status?.state === 'not_run') {
      message = 'Code/SAST did not run for this scan. No code evidence is available.';
    } else if (status?.state === 'scanned' || status?.state === 'full') {
      message = 'Code/SAST ran and reported no code findings in the scan payload.';
    }
    return <EmptyState>{message}</EmptyState>;
  }
  return (
    <div className="etd-list">
      {rows.map((row) => (
        <article className="etd-code-item" key={row.id}>
          <div className="etd-item-head">
            <span className="etd-strong">{row.rule}</span>
            <Pill tone={severityTone(row.severity)}>{row.severity}</Pill>
          </div>
          <div className="etd-meta-line">
            <span>{row.file}</span>
            {row.line && <span>Line {row.line}{row.endLine && row.endLine > row.line ? `-${row.endLine}` : ''}</span>}
          </div>
          {row.snippet && <pre className="etd-snippet">{row.snippet}</pre>}
        </article>
      ))}
    </div>
  );
}

function NetworkPanel({ rows }) {
  if (!rows.length) return <EmptyState>No network domains, URLs, or host-permission capabilities were included.</EmptyState>;
  return (
    <div className="etd-table etd-network" role="table" aria-label="Network evidence">
      <div className="etd-row etd-row-head" role="row">
        <span role="columnheader">Target</span><span role="columnheader">Type</span><span role="columnheader">Status</span><span role="columnheader">Evidence</span>
      </div>
      {rows.map((row) => (
        <div className="etd-row" role="row" key={row.id}>
          <span role="cell" className="etd-strong">{row.target}</span>
          <span role="cell">{row.kind}</span>
          <span role="cell"><Pill tone={row.status === 'Observed' ? 'warn' : 'neutral'}>{row.status}</Pill></span>
          <span role="cell" className="etd-muted">{row.evidence || 'No detail provided'}</span>
        </div>
      ))}
    </div>
  );
}

function VirusTotalPanel({ summary, rows }) {
  const hasSummary = Object.values(summary || {}).some((value) => value !== undefined && value !== null && value !== '');
  if (!hasSummary && !rows.length) return <EmptyState>No VirusTotal result data was included in the scan payload.</EmptyState>;
  return (
    <div className="etd-list">
      {hasSummary && (
        <div className="etd-summary-grid">
          <div><span className="etd-key">Coverage</span><span>{summary.enabled === false ? 'Not run' : 'Available'}</span></div>
          <div><span className="etd-key">Files analyzed</span><span>{summary.filesAnalyzed ?? '—'}</span></div>
          <div><span className="etd-key">Found in VT</span><span>{summary.filesFound ?? '—'}</span></div>
          <div><span className="etd-key">Malicious</span><span>{summary.malicious ?? 0}</span></div>
          <div><span className="etd-key">Suspicious</span><span>{summary.suspicious ?? 0}</span></div>
          <div><span className="etd-key">Threat level</span><span>{summary.threat || 'Not reported'}</span></div>
        </div>
      )}
      {rows.map((row) => (
        <article className="etd-code-item" key={row.id}>
          <div className="etd-item-head">
            <span className="etd-strong">{row.file}</span>
            <Pill tone={row.malicious > 0 || row.suspicious > 0 ? 'bad' : 'good'}>{row.status}</Pill>
          </div>
          <div className="etd-meta-line">
            <span>{row.malicious} malicious</span>
            <span>{row.suspicious} suspicious</span>
            {row.total && <span>{row.total} engines</span>}
            {row.hash && <span>SHA-256 {row.hash}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

function GovernancePanel({ rows }) {
  if (!rows.length) return <EmptyState>No governance rule results were included in the scan payload.</EmptyState>;
  return (
    <div className="etd-list">
      {rows.map((row) => (
        <article className="etd-code-item" key={row.id}>
          <div className="etd-item-head">
            <span className="etd-strong">{row.rulepack} · {row.ruleId}</span>
            <Pill tone={severityTone(row.verdict)}>{row.verdict}</Pill>
          </div>
          {row.reason && <p className="etd-row-copy">{row.reason}</p>}
          {row.action && <div className="etd-meta-line"><span>Action</span><span>{row.action}</span></div>}
        </article>
      ))}
    </div>
  );
}

function CoveragePanel({ rows }) {
  if (!rows.length) return <EmptyState>No analyzer coverage rows were available.</EmptyState>;
  return (
    <div className="etd-table etd-coverage" role="table" aria-label="Analyzer coverage details">
      <div className="etd-row etd-row-head" role="row">
        <span role="columnheader">Analyzer</span><span role="columnheader">Coverage</span><span role="columnheader">Status</span><span role="columnheader">Last updated</span>
      </div>
      {rows.map((row) => {
        const Icon = ANALYZER_ICON[row.key] || Code2;
        return (
          <div className="etd-row" role="row" key={row.key}>
            <span role="cell" className="etd-coverage-analyzer">
              <Icon size={16} aria-hidden="true" />
              <span>
                <span className="etd-strong">{row.label}</span>
                <span className="etd-coverage-checks">{row.whatItChecks}</span>
              </span>
            </span>
            <span role="cell"><Pill tone={row.tone}>{row.coverageLabel}</Pill></span>
            <span role="cell" className="etd-coverage-status">{row.statusText}</span>
            <span role="cell" className="etd-muted">{formatDate(row.lastUpdated)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default EvidenceTechnicalDetails;
