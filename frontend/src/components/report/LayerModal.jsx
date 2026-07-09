import React from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { AlertTriangle, Check, ChevronDown, HelpCircle, Info, Landmark, Lock, Shield } from 'lucide-react';
import { buildLayerModalModel } from './layerFactors';
import './LayerModal.scss';

// Short, sentence-case tags used as a secondary caption on flagged/uncovered rows.
const CATEGORY_TAG = {
  code:   'Code',
  threat: 'Threat',
  trust:  'Trust',
  access: 'Permissions',
  data:   'Data',
  policy: 'Policy',
};

const LAYER_CONFIG = {
  security:   { title: 'Security',   Icon: Shield },
  privacy:    { title: 'Privacy',    Icon: Lock },
  governance: { title: 'Governance', Icon: Landmark },
};

function bandLabel(band) {
  switch (band) {
    case 'GOOD': return 'Safe';
    case 'WARN': return 'Needs review';
    case 'BAD':  return 'Not safe';
    default:     return 'Not rated';
  }
}

function bandToneClass(band) {
  switch (band) {
    case 'GOOD': return 'lm-verdict-good';
    case 'WARN': return 'lm-verdict-warn';
    case 'BAD':  return 'lm-verdict-bad';
    default:     return 'lm-verdict-na';
  }
}

const InfoTooltip = ({ text }) => {
  const triggerRef = React.useRef(null);
  const [visible, setVisible] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipHalfWidth = 120;
    setPosition({
      top: Math.max(16, rect.top - 8),
      left: Math.min(
        Math.max(rect.left + rect.width / 2, tooltipHalfWidth + 12),
        window.innerWidth - tooltipHalfWidth - 12
      ),
    });
  }, []);

  const showTooltip = () => {
    updatePosition();
    setVisible(true);
  };

  const hideTooltip = () => setVisible(false);

  React.useEffect(() => {
    if (!visible) return undefined;
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [updatePosition, visible]);

  return (
    <>
      <span
        className="lm-info-trigger"
        role="button"
        aria-label="More info"
        tabIndex={0}
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <Info size={13} strokeWidth={2} />
      </span>
      {visible && typeof document !== 'undefined' && createPortal(
        <span
          className="lm-info-tooltip lm-info-tooltip--portal"
          role="tooltip"
          style={{ top: position.top, left: position.left }}
        >
          {text}
        </span>,
        document.body
      )}
    </>
  );
};

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const EvidenceRows = ({ rows }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="lm-evidence-empty">
        No structured evidence is available for this item.
      </div>
    );
  }

  return (
    <div className="lm-evidence-panel">
      {rows.map((row, index) => (
        <div className={`lm-evidence-row${row.kind === 'snippet' ? ' lm-evidence-row--snippet' : ''}`} key={`${row.key}-${index}`}>
          <span className="lm-evidence-row-key">{row.key}</span>
          {row.kind === 'snippet' ? (
            <pre className="lm-evidence-snippet">{row.value}</pre>
          ) : (
            <span className="lm-evidence-row-value">{row.value}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/** Prominent row for a flagged or uncovered check (issues + not-analyzed tiers). */
const PrimaryCheckRow = ({ item, index, expanded, onToggle }) => {
  const hasEvidence = Boolean(item.evidence || (item.evidenceRows && item.evidenceRows.length));
  const glyph = item.statusType === 'issues'
    ? <AlertTriangle size={15} strokeWidth={2.25} />
    : <HelpCircle size={15} strokeWidth={2.25} />;
  return (
  <div
    className={`lm-check lm-check--${item.statusType} lm-tone-${item.tone}`}
    style={{ animationDelay: `${index * 30}ms` }}
    role="listitem"
  >
    <span className="lm-check-rail" aria-hidden />
    <span className="lm-check-glyph" aria-hidden>{glyph}</span>
    <div className="lm-check-main">
      <div className="lm-check-title-row">
        <span className="lm-check-name">
          {item.title || item.label}
          {item.description && <InfoTooltip text={item.description} />}
        </span>
        {CATEGORY_TAG[item.category] ? (
          <span className="lm-check-tag">{CATEGORY_TAG[item.category]}</span>
        ) : item.source ? (
          <span className="lm-check-tag">{item.source}</span>
        ) : null}
      </div>
      {item.evidence && (
        <span className="lm-check-evidence" title={item.evidence}>
          <span className="lm-check-evidence-key">Evidence</span>
          {item.evidence}
        </span>
      )}
    </div>
    <div className="lm-check-actions">
      <span className={`lm-check-status lm-status-${item.statusType} lm-tone-pill-${item.tone}`}>{item.status}</span>
      <button
        type="button"
        className={`lm-evidence-toggle${expanded ? ' is-open' : ''}`}
        aria-expanded={expanded}
        aria-label={`Toggle evidence for ${item.title || item.label}`}
        onClick={onToggle}
      >
        <ChevronDown size={15} aria-hidden />
      </button>
    </div>
    {expanded && (
      <div className="lm-check-detail">
        {hasEvidence && item.evidence && (
          <p className="lm-check-detail-summary">{item.evidence}</p>
        )}
        <EvidenceRows rows={item.evidenceRows} />
      </div>
    )}
  </div>
  );
};

const ClearedRow = ({ item, index }) => (
  <div className="lm-clear-row" key={`c-${index}`} role="listitem">
    <Check className="lm-clear-tick" size={13} strokeWidth={2.5} aria-hidden />
    <span className="lm-clear-name">{item.label}</span>
    {item.desc && <InfoTooltip text={item.desc} />}
  </div>
);

const EmptyState = ({ children }) => (
  <p className="lm-empty">{children}</p>
);

const LayerModal = ({
  open,
  onClose,
  layer,
  score = null,
  band = 'NA',
  factors = [],
  keyFindings = [],
  gateResults = [],
  layerReasons = [],
}) => {
  const config = LAYER_CONFIG[layer] || LAYER_CONFIG.security;
  const Icon = config.Icon;

  // Severity-first modal model from real normalized factors/findings only.
  const { all, issues, notAnalyzed, cleared, about } = React.useMemo(
    () => buildLayerModalModel({ factors, keyFindings, gateResults, layerReasons }),
    [factors, keyFindings, gateResults, layerReasons]
  );
  const hasChecks = all.length > 0;
  const tabs = [
    { key: 'issues', label: 'Open Issues', count: issues.length },
    { key: 'cleared', label: 'Cleared', count: cleared.length },
    { key: 'unknown', label: 'Not Analyzed', count: notAnalyzed.length },
    { key: 'about', label: 'About', count: about.length },
  ];
  const initialTab = issues.length > 0 ? 'issues' : cleared.length > 0 ? 'cleared' : notAnalyzed.length > 0 ? 'unknown' : 'about';
  const firstIssueId = issues[0]?.id || null;
  const firstUnknownId = notAnalyzed[0]?.id || null;
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [expandedRow, setExpandedRow] = React.useState(firstIssueId);

  React.useEffect(() => {
    const nextTab = issues.length > 0 ? 'issues' : cleared.length > 0 ? 'cleared' : notAnalyzed.length > 0 ? 'unknown' : 'about';
    setActiveTab(nextTab);
    setExpandedRow(firstIssueId || firstUnknownId);
  }, [layer, firstIssueId, firstUnknownId, issues.length, cleared.length, notAnalyzed.length]);

  const toggleRow = (id) => setExpandedRow((current) => current === id ? null : id);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="lm-content lm-dialog-smooth" aria-describedby="lm-checks" aria-label={`${config.title} details`} data-layer={layer} data-band={band}>
        <DialogHeader className="lm-header-wrap">
          <DialogTitle className="lm-header">
            <div className="lm-header-inner">
              <div className="lm-header-left">
                <span className="lm-icon" aria-hidden><Icon size={18} strokeWidth={2.2} /></span>
                <div className="lm-title-block">
                  <span className="lm-title">{config.title}</span>
                  <span className="lm-summary">
                    {pluralize(issues.length, 'open issue')} · {pluralize(cleared.length, 'cleared', 'cleared')} · {pluralize(notAnalyzed.length, 'not analyzed', 'not analyzed')}
                  </span>
                </div>
              </div>
              <div className="lm-header-score">
                <span className="lm-score">{score ?? '—'}<span>/100</span></span>
                <span className={`lm-verdict-pill ${bandToneClass(band)}`}>{bandLabel(band)}</span>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="lm-visually-hidden">
            {config.title} layer details including open issues, cleared checks, not analyzed checks, and supporting evidence.
          </DialogDescription>
        </DialogHeader>

        <div className="lm-body" id="lm-checks">
          {!hasChecks && (
            <EmptyState>No checks are available for this layer.</EmptyState>
          )}

          <div className="lm-tabs" role="tablist" aria-label={`${config.title} detail sections`}>
            {tabs.map((tab) => (
              <button
                type="button"
                role="tab"
                key={tab.key}
                className={`lm-tab${activeTab === tab.key ? ' is-active' : ''}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`lm-panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span>{tab.count}</span>
              </button>
            ))}
          </div>

          {activeTab === 'issues' && (
            <section className="lm-tier lm-tier--issues" id="lm-panel-issues" role="tabpanel" aria-label="Open issues">
              {issues.length === 0 && <EmptyState>No open issues were reported for this layer.</EmptyState>}
              <div className="lm-rows" role="list">
                {issues.map((item, idx) => (
                  <PrimaryCheckRow
                    key={item.id}
                    item={item}
                    index={idx}
                    expanded={expandedRow === item.id}
                    onToggle={() => toggleRow(item.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {activeTab === 'cleared' && (
            <section className="lm-tier lm-tier--clear" id="lm-panel-cleared" role="tabpanel" aria-label="Cleared checks">
              {cleared.length === 0 && <EmptyState>No cleared checks are available for this layer.</EmptyState>}
              <div className="lm-clear-grid" role="list">
                {cleared.map((item, idx) => (
                  <ClearedRow item={item} index={idx} key={`c-${idx}`} />
                ))}
              </div>
            </section>
          )}

          {activeTab === 'unknown' && (
            <section className="lm-tier lm-tier--unknown" id="lm-panel-unknown" role="tabpanel" aria-label="Not analyzed">
              {notAnalyzed.length === 0 && <EmptyState>No checks are marked not analyzed for this layer.</EmptyState>}
              <div className="lm-rows" role="list">
                {notAnalyzed.map((item, idx) => (
                  <PrimaryCheckRow
                    key={item.id}
                    item={item}
                    index={idx}
                    expanded={expandedRow === item.id}
                    onToggle={() => toggleRow(item.id)}
                  />
                ))}
              </div>
              {notAnalyzed.length > 0 && <p className="lm-tier-note">Coverage unavailable - treat as unknown, not safe.</p>}
            </section>
          )}

          {activeTab === 'about' && (
            <section className="lm-tier lm-tier--about" id="lm-panel-about" role="tabpanel" aria-label="Layer details">
              <div className="lm-about-card">
                <span className="lm-about-label">Layer status</span>
                <p>{bandLabel(band)} based on {hasChecks ? pluralize(all.length, 'check') : 'available report data'}.</p>
              </div>
              {about.length === 0 ? (
                <EmptyState>No additional layer details are available in this scan.</EmptyState>
              ) : (
                <ul className="lm-about-list">
                  {about.map((reason) => <li key={reason.id}>{reason.text}</li>)}
                </ul>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LayerModal;
