import React from 'react';
import './SummaryPanel.scss';
import { normalizeHighlights, resolveCoverage, resolveProvenance, resolveAnalyzerStatus } from '../../utils/normalizeScanResult';
import { resolveDecisionAuthorityDisplay, POLICY_DECISION_LABEL } from '../../utils/reportDisplay';

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
  topFindings = [],
  onViewRiskyPermissions = null,
  onViewNetworkDomains = null,
  onViewEvidence = null
}) => {
  const unifiedSummary = rawScanResult?.report_view_model?.unified_summary;
  const consumerSummary = rawScanResult?.report_view_model?.consumer_summary;
  // Fallback: highlights (keyPoints) and SAST/engine keyFindings for concerns
  const { oneLiner, keyPoints } = normalizeHighlights(rawScanResult);
  const overallScore = Number.isFinite(scores?.overall?.score) ? Math.round(scores.overall.score) : null;
  const overallBand = scores?.overall?.band || 'NA';
  const decision = scores?.decision || null;
  const overallConfidence = Number.isFinite(scores?.overall?.confidence)
    ? Math.round(scores.overall.confidence * 100)
    : null;
  const decisionAuthority = typeof scores?.decisionAuthority === 'string' && scores.decisionAuthority.trim()
    ? scores.decisionAuthority
    : null;

  // "Why this verdict" authority element: state WHICH authority in the backend
  // Decision Authority chain produced the verdict (governance rule / hard gate /
  // limited coverage / score), derived from data the payload already carries.
  // A reputation/maintenance signal is never an authority in the chain, so it
  // can never surface here as the decision basis.
  const authorityScoringV2 = rawScanResult?.scoring_v2 || rawScanResult?.governance_bundle?.scoring_v2 || {};
  const authorityGovFinding = (keyFindings || []).find(
    (f) => f?.evidence?.kind === 'governance' && (f.evidence.ruleId || f.evidence.rulepack)
  );
  const authorityDisplay = resolveDecisionAuthorityDisplay(decisionAuthority, {
    coverageCapApplied: Boolean(authorityScoringV2.coverage_cap_applied),
    rulepack: authorityGovFinding?.evidence?.rulepack || null,
    ruleId: authorityGovFinding?.evidence?.ruleId || null,
    gate: Array.isArray(authorityScoringV2.hard_gates_triggered) ? authorityScoringV2.hard_gates_triggered[0] : null,
  });

  // SAST/engine keyFindings – use for Quick Summary concerns when they add value
  const engineConcerns = (keyFindings || [])
    .filter(f => f.severity === 'high' || f.severity === 'medium')
    .slice(0, 4)
    .map(f => f.summary || f.title);

  const findingOrder = { high: 3, medium: 2, low: 1 };
  const normalizedTopFindings = (Array.isArray(topFindings) ? topFindings : [])
    .filter((finding) => finding && (finding.title || finding.summary))
    .map((finding, index) => ({
      id: `${finding.title || 'finding'}-${index}`,
      title: finding.title || 'Finding',
      summary: finding.summary || finding.title || '',
      severity: typeof finding.severity === 'string' ? finding.severity : 'medium',
      evidenceIds: Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [],
      evidence: finding.evidence || null,
    }));

  const fallbackFindings = (keyFindings || [])
    .filter((finding) => finding && (finding.title || finding.summary))
    .sort((a, b) => (findingOrder[b?.severity] || 0) - (findingOrder[a?.severity] || 0))
    .slice(0, 4)
    .map((finding, index) => ({
      id: `${finding.title || 'finding'}-${index}`,
      title: finding.title || 'Finding',
      summary: finding.summary || finding.title || '',
      severity: finding.severity || 'medium',
      evidenceIds: Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [],
      evidence: finding.evidence || null,
    }));

  const findingsToShow = (normalizedTopFindings.length > 0 ? normalizedTopFindings : fallbackFindings)
    .slice(0, 4);

  const hasUnifiedSummary = unifiedSummary && (unifiedSummary.headline || unifiedSummary.tldr);
  const hasConsumerSummary = consumerSummary && consumerSummary.verdict;
  const hasLegacy = oneLiner || keyPoints.length > 0 || engineConcerns.length > 0 || findingsToShow.length > 0;
  const hasAnySummary = hasUnifiedSummary || hasConsumerSummary || hasLegacy;
  const showPlaceholder = !hasAnySummary && (onViewRiskyPermissions || onViewNetworkDomains);

  const getDecisionBadge = () => {
    if (!decision) return null;
    const badges = {
      'ALLOW': { label: 'SAFE', icon: '✓', modifier: 'allow' },
      'WARN': { label: 'REVIEW', icon: '⚡', modifier: 'warn' },
      'BLOCK': { label: 'BLOCKED', icon: '✕', modifier: 'block' },
    };
    const badge = badges[decision] || badges['WARN'];
    return (
      <span className={`decision-badge decision-badge--${badge.modifier}`}>
        <span className="badge-icon">{badge.icon}</span>
        <span className="badge-text">{badge.label}</span>
      </span>
    );
  };

  const getRiskHeadline = () => {
    if (decision === 'BLOCK') {
      return {
        title: 'Blocked',
        tone: 'bad',
        detail: 'Blocked by automated checks. Do not install until a manual security review clears the findings.',
      };
    }
    if (decision === 'WARN') {
      return {
        title: 'Needs Review',
        tone: 'warn',
        detail: 'This extension has unresolved risks or incomplete analysis coverage. Review the findings before installing.',
      };
    }
    if (overallBand === 'GOOD') {
      return {
        title: 'Low Risk',
        tone: 'good',
        detail: 'The analyzed security, privacy, and governance layers did not surface major red flags.',
      };
    }
    if (overallBand === 'BAD') {
      return {
        title: 'High Risk',
        tone: 'bad',
        detail: 'Multiple risk signals pushed this extension into the unsafe band. Do not install until the flagged issues are reviewed.',
      };
    }
    if (overallBand === 'WARN') {
      return {
        title: 'Moderate Risk',
        tone: 'warn',
        detail: 'Some findings require review before this extension can be treated as trustworthy.',
      };
    }
    return {
      title: 'Risk Unclear',
      tone: 'neutral',
      detail: 'Not enough structured data is available to confidently classify this extension yet.',
    };
  };

  const riskHeadline = getRiskHeadline();
  // Coverage must never show "Full" when a key analyzer (SAST) did not run.
  // resolveCoverage inspects insufficient_data, the coverage cap, and whether
  // SAST actually ran — defaulting to Partial when it cannot confirm full coverage.
  const coverage = resolveCoverage(rawScanResult);
  // Store-listing provenance/trust (Edge-only, fabricated URL, missing metadata).
  const provenance = resolveProvenance(rawScanResult);

  // The lead sentence must never contradict the authoritative verdict: a
  // review/blocked verdict must not be paired with an LLM "appears safe" line.
  const verdictIsClearlySafe = decision === 'ALLOW' || (!decision && overallBand === 'GOOD');
  const candidateLead = [
    unifiedSummary?.headline,
    consumerSummary?.verdict,
    oneLiner,
  ].find((value) => typeof value === 'string' && value.trim());
  const leadAssertsSafePattern = /\b(safe|no (?:major )?(?:issues|risks|concerns|red flags)|looks good|appears fine|trustworthy)\b/i;
  const leadAssertsSafe = typeof candidateLead === 'string' && leadAssertsSafePattern.test(candidateLead);

  // UX calibration: a REVIEW verdict with a high score must not read like a
  // failure or hide behind vague LLM copy. Surface a plain, evidence-backed
  // reason that bridges the score/verdict gap ("High score, but review because
  // it runs on all websites / has obfuscated code / has a governance warning").
  const buildReviewDrivers = () => {
    const drivers = [];
    const man = rawScanResult?.manifest || {};
    const hosts = [
      ...(Array.isArray(man.host_permissions) ? man.host_permissions : []),
      ...((Array.isArray(man.content_scripts) ? man.content_scripts : [])
        .flatMap((c) => (Array.isArray(c?.matches) ? c.matches : []))),
    ];
    const BROAD = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];
    if (hosts.some((h) => BROAD.includes(h))) {
      drivers.push('it can run on every website you visit');
    }
    const secFactors = rawScanResult?.governance_bundle?.scoring_v2?.security_layer?.factors || [];
    if (secFactors.some((f) => f?.name === 'Obfuscation' && (f.severity || 0) >= 0.4)) {
      drivers.push('it contains obfuscated or minified code');
    }
    if (scores?.governance?.band && scores.governance.band !== 'GOOD') {
      drivers.push('it has a governance/policy warning');
    }
    if (coverage.level !== 'full') {
      drivers.push('automated code analysis did not fully run');
    }
    if (drivers.length === 0) {
      const r = (Array.isArray(scores?.reasons) ? scores.reasons : [])
        .find((x) => typeof x === 'string' && x.trim());
      if (r) drivers.push(r.trim().replace(/\.$/, '').replace(/^([A-Z])/, (c) => c.toLowerCase()));
    }
    return drivers.slice(0, 2);
  };

  const reviewDrivers = decision === 'WARN' ? buildReviewDrivers() : [];
  const calibratedReviewLead = (decision === 'WARN' && reviewDrivers.length > 0)
    ? (overallScore !== null && overallScore >= 80
        ? `High score (${overallScore}/100), but review recommended because ${reviewDrivers.join(' and ')}.`
        : `Review recommended because ${reviewDrivers.join(' and ')}.`)
    : null;

  const summaryLead = calibratedReviewLead
    || ((!candidateLead || (!verdictIsClearlySafe && leadAssertsSafe))
      ? riskHeadline.detail
      : candidateLead);

  // Any short verdict-like line (headline / verdict / one-liner) must never
  // assert safety when the authoritative verdict is not clearly safe. Returns
  // null so the containing block is hidden, avoiding "Needs Review" + "appears
  // safe" contradictions anywhere in the panel.
  const verdictSafeText = (text) => {
    if (typeof text !== 'string' || !text.trim()) return null;
    if (verdictIsClearlySafe) return text;
    return leadAssertsSafePattern.test(text) ? null : text;
  };

  const renderRiskCallout = () => (
    <div className={`summary-risk-callout summary-risk-callout--${riskHeadline.tone}`}>
      <div className="summary-risk-copy">
        <div className="summary-risk-kicker">{riskHeadline.title}</div>
        <p className="summary-risk-text">{summaryLead}</p>
      </div>
      <div className="summary-risk-stats">
        <div className="summary-risk-stat">
          <span className="summary-risk-stat-label">Score</span>
          <strong className="summary-risk-stat-value">
            {overallScore !== null ? `${overallScore}/100` : 'Unknown'}
          </strong>
        </div>
        <div className="summary-risk-stat">
          <span className="summary-risk-stat-label">Confidence</span>
          <strong className="summary-risk-stat-value">
            {overallConfidence !== null ? `${overallConfidence}%` : 'Unknown'}
          </strong>
        </div>
        <div className="summary-risk-stat">
          <span className="summary-risk-stat-label">Coverage</span>
          <strong className={`summary-risk-stat-value summary-risk-stat-value--${coverage.tone}`}>
            {coverage.label}
          </strong>
        </div>
        <div className="summary-risk-stat">
          <span className="summary-risk-stat-label">Listing</span>
          <strong className={`summary-risk-stat-value summary-risk-stat-value--${provenance.tone}`}>
            {provenance.label}
          </strong>
        </div>
      </div>
    </div>
  );

  // Progressive disclosure: a collapsed "why" that explains a Review/Blocked
  // verdict without cluttering the headline — coverage gaps, listing-trust
  // caveats, and the top decision reasons, deduped and capped.
  const whyReasons = (() => {
    const out = [];
    // Lead the "why" with the plain review drivers so it is never empty for a
    // non-safe verdict.
    reviewDrivers.forEach((d) => out.push(`${d.charAt(0).toUpperCase()}${d.slice(1)}.`));
    if (coverage.level === 'limited') {
      out.push('Limited analyzer coverage — key checks (including code analysis) did not run.');
    } else if (coverage.level === 'partial') {
      out.push('Partial coverage — code analysis (SAST) did not run, so this is not a full clearance.');
    }
    provenance.notes.forEach((n) => out.push(n));
    (Array.isArray(scores?.reasons) ? scores.reasons : [])
      .filter((r) => typeof r === 'string' && r.trim())
      .forEach((r) => out.push(r));
    const seen = new Set();
    return out
      .filter((r) => typeof r === 'string' && r.trim())
      .filter((r) => {
        const k = r.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 5);
  })();

  // Explicit analyzer status — never let a missing analyzer read as "clean".
  const analyzerStatus = resolveAnalyzerStatus(rawScanResult);

  const renderWhyVerdict = () => {
    if (whyReasons.length === 0 && analyzerStatus.length === 0) return null;
    return (
      <details className="summary-why">
        <summary className="summary-why-summary">Why is this {riskHeadline.title}?</summary>
        {whyReasons.length > 0 && (
          <ul className="summary-why-list">
            {whyReasons.map((reason, idx) => (
              <li key={idx} className="summary-why-item">{reason}</li>
            ))}
          </ul>
        )}
        {analyzerStatus.length > 0 && (
          <div className="summary-analyzers">
            <div className="summary-analyzers-title">Analyzer coverage</div>
            <ul className="summary-analyzers-list">
              {analyzerStatus.map((a) => (
                <li key={a.key} className={`summary-analyzer summary-analyzer--${a.ok ? 'ok' : 'warn'}`}>
                  <span className="summary-analyzer-dot" aria-hidden="true" />
                  <span className="summary-analyzer-label">{a.label}:</span>{' '}
                  <span className="summary-analyzer-status">{a.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {authorityDisplay && (
          authorityDisplay.description ? (
            <p className="summary-why-authority" data-authority={authorityDisplay.authority}>
              {authorityDisplay.isPolicyDecision && (
                <strong className="summary-why-authority-tag">{POLICY_DECISION_LABEL}: </strong>
              )}
              {authorityDisplay.description}
            </p>
          ) : (
            <p className="summary-why-authority" data-authority={authorityDisplay.authority}>
              Decision basis: {authorityDisplay.fallbackLabel}
            </p>
          )
        )}
      </details>
    );
  };

  // Verdict headline + the collapsed "why" — rendered together at the top of
  // every summary shape.
  const renderVerdictBlock = () => (
    <>
      {renderRiskCallout()}
      {renderWhyVerdict()}
    </>
  );

  const renderKeyFindings = () => {
    if (findingsToShow.length === 0) return null;
    return (
      <div className="summary-section findings-section">
        <h3 className="section-subtitle">
          <span className="subtitle-icon">⚠</span>
          Key Findings
        </h3>
        <div className="summary-findings-list">
          {findingsToShow.map((finding) => (
            <div key={finding.id} className={`summary-finding-card summary-finding-card--${finding.severity || 'medium'}`}>
              <div className="summary-finding-header">
                <span className="summary-finding-title">{finding.title}</span>
                <span className={`summary-finding-severity summary-finding-severity--${finding.severity || 'medium'}`}>
                  {finding.severity || 'medium'}
                </span>
              </div>
              <p className="summary-finding-summary">{finding.summary}</p>
              {finding.evidence && finding.evidence.available && finding.evidence.label && (
                <p className="summary-finding-evidence-ref" title={finding.evidence.snippet || finding.evidence.reason || finding.evidence.finalReason || ''}>
                  <span className="summary-finding-evidence-ref__label">Evidence:</span> {finding.evidence.label}
                </p>
              )}
              {finding.evidence && finding.evidence.available === false && (
                <p className="summary-finding-evidence-ref summary-finding-evidence-ref--none">Based on summary only</p>
              )}
              {typeof onViewEvidence === 'function' && finding.evidenceIds.length > 0 && (
                <button
                  type="button"
                  className="summary-finding-evidence"
                  onClick={() => onViewEvidence(finding.evidenceIds)}
                >
                  View evidence
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Placeholder copy must never soften the authoritative verdict: a BLOCK must
  // read as blocked, a review verdict as unresolved — not "review before installing".
  const getPlaceholderLines = () => {
    if (decision === 'BLOCK') {
      return [
        'Blocked — do not install until a security review clears the findings.',
        'This extension failed automated checks and should be treated as unsafe for now.',
      ];
    }
    if (decision === 'WARN') {
      return [
        'Needs review — do not treat this extension as safe yet.',
        'Review the flagged permissions, evidence, and update status before installing.',
      ];
    }
    return [
      'Review this extension before installing.',
      'Check the permissions, findings, and listing details first.',
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
          {renderVerdictBlock()}
          <div className="summary-placeholder-wrapper">
            {getPlaceholderLines().map((line, idx) => (
              <p key={idx} className="summary-placeholder-line">{line}</p>
            ))}
          </div>
          {renderKeyFindings()}
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
          {renderVerdictBlock()}
          {/* Headline – short takeaway (never contradicts the verdict) */}
          {verdictSafeText(headline) && (
            <div className="summary-headline-wrapper">
              <h3 className="summary-headline">{verdictSafeText(headline)}</h3>
            </div>
          )}

          {renderKeyFindings()}

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
          {renderVerdictBlock()}
          {/* Verdict - the headline (never contradicts the authoritative verdict) */}
          {verdictSafeText(verdict) && (
            <div className="summary-verdict-wrapper">
              <p className="summary-verdict">{verdictSafeText(verdict)}</p>
            </div>
          )}

          {renderKeyFindings()}

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
        {renderVerdictBlock()}
        {/* One-liner summary (never contradicts the authoritative verdict) */}
        {verdictSafeText(oneLiner) && (
          <div className="summary-verdict-wrapper">
            <p className="summary-verdict">{verdictSafeText(oneLiner)}</p>
          </div>
        )}

        {renderKeyFindings()}

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
