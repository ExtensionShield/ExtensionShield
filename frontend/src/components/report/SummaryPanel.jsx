import React from 'react';
import './SummaryPanel.scss';
import { normalizeHighlights } from '../../utils/normalizeScanResult';

/**
 * SummaryPanel – consumer-friendly scan summary.
 *
 * Supports two report shapes:
 * - unified_summary: headline, tldr, concerns, recommendation
 * - consumer_summary: verdict, reasons, access, action
 *
 * Falls back through highlights and engine findings when needed.
 *
 * onViewRiskyPermissions, onViewNetworkDomains: optional action handlers.
 */

const SummaryPanel = ({
  scores = {},
  rawScanResult = null,
  keyFindings = [],
  onViewRiskyPermissions = null,
  onViewNetworkDomains = null
}) => {
  const unifiedSummary = rawScanResult?.report_view_model?.unified_summary;
  const consumerSummary = rawScanResult?.report_view_model?.consumer_summary;
  // Fallback: highlights (keyPoints) and SAST/engine keyFindings for concerns
  const { oneLiner, keyPoints } = normalizeHighlights(rawScanResult);

  // SAST/engine keyFindings – use for Quick Summary concerns when they add value
  const engineConcerns = (keyFindings || [])
    .filter(f => f.severity === 'high' || f.severity === 'medium')
    .slice(0, 4)
    .map(f => f.summary || f.title);

  const hasUnifiedSummary = unifiedSummary && (unifiedSummary.headline || unifiedSummary.tldr);
  const hasConsumerSummary = consumerSummary && consumerSummary.verdict;
  const hasLegacy = oneLiner || keyPoints.length > 0 || engineConcerns.length > 0;
  const hasAnySummary = hasUnifiedSummary || hasConsumerSummary || hasLegacy;
  const showPlaceholder = !hasAnySummary && (onViewRiskyPermissions || onViewNetworkDomains);

  const getDecisionBadge = () => {
    const decision = scores?.decision;
    if (!decision) return null;
    const badges = {
      'ALLOW': { label: 'SAFE', icon: '✓' },
      'WARN': { label: 'REVIEW', icon: '⚡' },
      'BLOCK': { label: 'BLOCKED', icon: '✕' },
    };
    const badge = badges[decision] || badges['WARN'];
    const modifier = decision.toLowerCase();
    return (
      <span className={`decision-badge decision-badge--${modifier}`}>
        <span className="badge-icon">{badge.icon}</span>
        <span className="badge-text">{badge.label}</span>
      </span>
    );
  };

  // Placeholder copy must never soften the authoritative verdict: a BLOCK must
  // read as blocked, a review verdict as unresolved — not "review before installing".
  const getPlaceholderLines = () => {
    const decision = scores?.decision;
    if (decision === 'BLOCK') {
      return [
        'Blocked — do not install without a security review.',
        'This extension failed automated security checks.',
      ];
    }
    if (decision === 'WARN') {
      return [
        'Not safe yet — review unresolved risks before installing.',
        'Avoid on sensitive sites (banking/email).',
      ];
    }
    return [
      'Review this extension before installing.',
      'Avoid on sensitive sites (banking/email).',
    ];
  };

  if (showPlaceholder) {
    return (
      <section className="summary-panel summary-panel--unified">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>
        <div className="summary-content">
          <div className="summary-placeholder-wrapper">
            {getPlaceholderLines().map((line, idx) => (
              <p key={idx} className="summary-placeholder-line">{line}</p>
            ))}
          </div>
          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!hasAnySummary) {
    return null;
  }

  if (hasUnifiedSummary) {
    const { headline, narrative, tldr, concerns = [], recommendation } = unifiedSummary;

    // Prefer narrative when present – it weaves capabilities, concerns, and recommendation
    const hasNarrative = narrative && narrative.trim().length > 0;
    const showLegacySections = !hasNarrative;

    return (
      <section className="summary-panel summary-panel--unified">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>

        <div className="summary-content">
          {/* Headline – short takeaway */}
          {headline && (
            <div className="summary-headline-wrapper">
              <h3 className="summary-headline">{headline}</h3>
            </div>
          )}

          {hasNarrative && (
            <div className="summary-narrative-wrapper">
              <p className="summary-narrative">{narrative}</p>
            </div>
          )}

          {showLegacySections && tldr && (
            <div className="summary-tldr-wrapper">
              <p className="summary-tldr">{tldr}</p>
            </div>
          )}
          {showLegacySections && ((concerns && concerns.length > 0) || engineConcerns.length > 0) && (
            <div className="summary-section concerns-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">⚠️</span>
                Key Concerns
              </h3>
              <ul className="concerns-list">
                {(concerns && concerns.length > 0 ? concerns : engineConcerns).map((concern, idx) => (
                  <li key={idx} className="concern-item">
                    <span className="concern-bullet">•</span>
                    <span className="concern-text">{concern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showLegacySections && recommendation && (
            <div className="summary-section recommendation-section">
              <div className="recommendation-card">
                <span className="recommendation-icon">👉</span>
                <span className="recommendation-text">{recommendation}</span>
              </div>
            </div>
          )}

          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (hasConsumerSummary) {
    const { verdict, reasons = [], access, action } = consumerSummary;

    return (
      <section className="summary-panel">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>

        <div className="summary-content">
          {/* Verdict - the headline */}
          {verdict && (
            <div className="summary-verdict-wrapper">
              <p className="summary-verdict">{verdict}</p>
            </div>
          )}

          {/* Reasons - why this score */}
          {reasons.length > 0 && (
            <div className="summary-section key-reasons">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">📌</span>
                Why This Score
              </h3>
              <div className="reasons-list">
                {reasons.map((reason, idx) => (
                  <div key={idx} className="reason-card">
                    <span className="reason-number">{idx + 1}</span>
                    <p className="reason-text">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Access - what it can access */}
          {access && (
            <div className="summary-section access-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">🔑</span>
                What It Can Access
              </h3>
              <div className="access-card">
                <span className="access-text">{access}</span>
              </div>
            </div>
          )}

          {/* Action - what to do */}
          {action && (
            <div className="summary-section action-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">👉</span>
                What to Do
              </h3>
              <div className="action-card">
                <span className="action-text">{action}</span>
              </div>
            </div>
          )}

          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  const concernsToShow = engineConcerns.length > 0 ? engineConcerns : keyPoints;

  return (
    <section className="summary-panel">
      <div className="summary-header">
        <h2 className="summary-title">
          <span className="title-icon">✨</span>
          Quick Summary
        </h2>
        {getDecisionBadge()}
      </div>

      <div className="summary-content">
        {/* One-liner summary */}
        {oneLiner && (
          <div className="summary-verdict-wrapper">
            <p className="summary-verdict">{oneLiner}</p>
          </div>
        )}

        {/* Key Concerns – from SAST/engine when available, else report highlights */}
        {concernsToShow.length > 0 && (
          <div className="summary-section key-reasons">
            <h3 className="section-subtitle">
              <span className="subtitle-icon">📌</span>
              Key Concerns
            </h3>
            <div className="reasons-list">
              {concernsToShow.map((point, idx) => (
                <div key={idx} className="reason-card">
                  <span className="reason-number">{idx + 1}</span>
                  <p className="reason-text">{point}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(onViewRiskyPermissions || onViewNetworkDomains) && (
          <div className="summary-action-buttons">
            {onViewRiskyPermissions && (
              <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                <span className="action-dot" /> View risky permissions
              </button>
            )}
            {onViewNetworkDomains && (
              <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                <span className="action-dot" /> View network domains
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default SummaryPanel;
