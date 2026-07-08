import React from 'react';
import { Code2, ShieldCheck, Store, BarChart3, ShieldAlert } from 'lucide-react';
import { resolveAnalyzerCoverage } from '../../utils/reportDisplay';
import './AnalyzerCoverage.scss';

const ANALYZER_ICON = {
  sast: Code2,
  virustotal: ShieldCheck,
  listing: Store,
  chromestats: BarChart3,
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * AnalyzerCoverage — an honest, always-visible breakdown of which analyzers ran
 * and how completely. Coverage is never implied as clean: a SAST scan of 0 files
 * reads "No code scanned", a disabled analyzer reads "Not run", and a crashed one
 * reads "Failed". Reads only existing payload fields via resolveAnalyzerCoverage.
 */
const AnalyzerCoverage = ({ rawScanResult }) => {
  const rows = resolveAnalyzerCoverage(rawScanResult);
  if (!rows.length) return null;

  const noCodeScanned = rows.some((r) => r.key === 'sast' && r.state === 'no_code_scanned');

  return (
    <section className="analyzer-coverage" id="analyzer-coverage" aria-labelledby="analyzer-coverage-heading">
      <div className="analyzer-coverage-head">
        <h2 id="analyzer-coverage-heading" className="analyzer-coverage-title">Analyzer Coverage</h2>
        <p className="analyzer-coverage-sub">Transparency about what was scanned and how.</p>
      </div>

      {noCodeScanned && (
        <div className="analyzer-coverage-note" role="note">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>Static analysis scanned 0 files for this extension. This is a coverage gap — it does not mean the code is clean.</span>
        </div>
      )}

      {/* Desktop table */}
      <div className="analyzer-coverage-table" role="table" aria-label="Analyzer coverage">
        <div className="acov-row acov-head" role="row">
          <span role="columnheader" className="acov-analyzer">Analyzer</span>
          <span role="columnheader" className="acov-checks">What it checks</span>
          <span role="columnheader" className="acov-coverage">Coverage</span>
          <span role="columnheader" className="acov-status">Status</span>
          <span role="columnheader" className="acov-updated">Last updated</span>
        </div>
        {rows.map((r) => {
          const Icon = ANALYZER_ICON[r.key] || Code2;
          return (
            <div className="acov-row" role="row" key={r.key}>
              <span role="cell" className="acov-analyzer">
                <Icon size={16} className="acov-analyzer-icon" aria-hidden="true" />
                <span className="acov-analyzer-label">{r.label}</span>
              </span>
              <span role="cell" className="acov-checks">{r.whatItChecks}</span>
              <span role="cell" className="acov-coverage">
                <span className={`acov-pill tone-${r.tone}`}>{r.coverageLabel}</span>
              </span>
              <span role="cell" className="acov-status">
                <span className={`acov-dot tone-${r.tone}`} aria-hidden="true" />
                <span className="acov-status-text">{r.statusText}</span>
              </span>
              <span role="cell" className="acov-updated">{formatDate(r.lastUpdated)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AnalyzerCoverage;
