import React from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { AlertTriangle, Check, HelpCircle, Info } from 'lucide-react';
import { triageFactors } from './layerFactors';
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
  security:   { title: 'Security',   icon: '🛡️' },
  privacy:    { title: 'Privacy',    icon: '🔒' },
  governance: { title: 'Governance', icon: '📋' },
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

/** Prominent row for a flagged or uncovered check (issues + not-analyzed tiers). */
const PrimaryCheckRow = ({ item, index }) => (
  <div
    className={`lm-check lm-check--${item.statusType} lm-tone-${item.tone}`}
    style={{ animationDelay: `${index * 30}ms` }}
    role="listitem"
  >
    <span className="lm-check-rail" aria-hidden />
    <span className="lm-check-glyph" aria-hidden>
      {item.statusType === 'issues'
        ? <AlertTriangle size={15} strokeWidth={2.25} />
        : <HelpCircle size={15} strokeWidth={2.25} />}
    </span>
    <span className="lm-check-main">
      <span className="lm-check-name">
        {item.label}
        {item.desc && <InfoTooltip text={item.desc} />}
      </span>
      {CATEGORY_TAG[item.category] && (
        <span className="lm-check-tag">{CATEGORY_TAG[item.category]}</span>
      )}
    </span>
    <span className={`lm-check-status lm-status-${item.statusType}`}>{item.status}</span>
  </div>
);

const LayerModal = ({
  open,
  onClose,
  layer,
  // eslint-disable-next-line no-unused-vars
  score = null,
  band = 'NA',
  factors = [],
  // eslint-disable-next-line no-unused-vars
  keyFindings = [],
  // eslint-disable-next-line no-unused-vars
  gateResults = [],
  // eslint-disable-next-line no-unused-vars
  layerReasons = [],
  // eslint-disable-next-line no-unused-vars
  layerDetails = null,
  // eslint-disable-next-line no-unused-vars
  onViewEvidence = null,
}) => {
  const config = LAYER_CONFIG[layer] || LAYER_CONFIG.security;

  // Severity-first triage: what's wrong, then what couldn't be checked, then what's fine.
  const { all, issues, notAnalyzed, cleared } = triageFactors(factors);
  const hasChecks = all.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="lm-content lm-dialog-smooth" aria-describedby="lm-checks" aria-label={`${config.title} details`} data-layer={layer} data-band={band}>
        <DialogHeader className="lm-header-wrap">
          <DialogTitle className="lm-header">
            <div className="lm-header-inner">
              <div className="lm-header-left">
                <span className="lm-icon" aria-hidden>{config.icon}</span>
                <span className="lm-title">{config.title}</span>
              </div>
              <span className={`lm-verdict-pill ${bandToneClass(band)}`}>{bandLabel(band)}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="lm-body" id="lm-checks">
          {!hasChecks && (
            <p className="lm-empty">No checks are available for this layer.</p>
          )}

          {issues.length > 0 && (
            <section className="lm-tier lm-tier--issues" aria-label="Issues found">
              <header className="lm-tier-head">
                <span className="lm-tier-title">Issues found</span>
                <span className="lm-tier-count lm-tier-count--issues">{issues.length}</span>
              </header>
              <div className="lm-rows" role="list">
                {issues.map((item, idx) => (
                  <PrimaryCheckRow key={`i-${idx}`} item={item} index={idx} />
                ))}
              </div>
            </section>
          )}

          {notAnalyzed.length > 0 && (
            <section className="lm-tier lm-tier--unknown" aria-label="Not analyzed">
              <header className="lm-tier-head">
                <span className="lm-tier-title">Not analyzed</span>
                <span className="lm-tier-count">{notAnalyzed.length}</span>
              </header>
              <div className="lm-rows" role="list">
                {notAnalyzed.map((item, idx) => (
                  <PrimaryCheckRow key={`u-${idx}`} item={item} index={idx} />
                ))}
              </div>
              <p className="lm-tier-note">Coverage unavailable — treat as unknown, not safe.</p>
            </section>
          )}

          {cleared.length > 0 && (
            <section className="lm-tier lm-tier--clear" aria-label="Checks that passed">
              <header className="lm-tier-head">
                <span className="lm-tier-title">Cleared</span>
                <span className="lm-tier-count">{cleared.length}</span>
              </header>
              <div className="lm-clear-grid" role="list">
                {cleared.map((item, idx) => (
                  <div className="lm-clear-row" key={`c-${idx}`} role="listitem">
                    <Check className="lm-clear-tick" size={13} strokeWidth={2.5} aria-hidden />
                    <span className="lm-clear-name">{item.label}</span>
                    {item.desc && <InfoTooltip text={item.desc} />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LayerModal;
