import React from 'react';
import './ReportScoreCard.scss';

/**
 * ReportScoreCard - Score card for Security/Privacy/Governance
 * 
 * Props from ReportViewModel:
 * - title: string ("Security" | "Privacy" | "Governance")
 * - score: number | null
 * - band: "GOOD" | "WARN" | "BAD" | "NA"
 * - confidence: number | null (0-1)
 * - contributors: FactorVM[] - Top contributing factors to show as chips
 */
const ReportScoreCard = ({ 
  title = 'Score',
  score = null,
  band = 'NA',
  contributors = [],
  icon = null,
  onClick = null
}) => {
  const getBandColor = () => {
    switch (band) {
      case 'GOOD': return 'var(--risk-good)';
      case 'WARN': return 'var(--risk-warn)';
      case 'BAD': return 'var(--risk-bad)';
      default: return 'var(--risk-neutral)';
    }
  };

  const getBandLabel = () => {
    switch (band) {
      case 'GOOD': return 'Safe';
      case 'WARN': return 'Review';
      case 'BAD': return 'Not safe';
      default: return 'N/A';
    }
  };

  const getBandIcon = () => {
    switch (band) {
      case 'GOOD': return '✓';
      case 'WARN': return '⚡';
      case 'BAD': return '✕';
      default: return '−';
    }
  };

  const getLayerIcon = () => {
    if (icon) return icon;
    switch (title.toLowerCase()) {
      case 'security': return '🛡️';
      case 'privacy': return '🔒';
      case 'governance': return '📋';
      default: return '📊';
    }
  };

  const color = getBandColor();
  const scorePercent = score !== null ? Math.round(score) : null;

  // Get top 2 contributors
  const topContributors = contributors
    .filter(f => f && f.name)
    .slice(0, 2);

  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div 
      className={`report-score-card band-${band.toLowerCase()} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Info button at top right */}
      {onClick && (
        <div className="score-card-top-right">
          <button 
            className="info-icon-btn" 
            aria-label="View details"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="info-svg">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span className="tooltip">View details</span>
          </button>
        </div>
      )}

      {/* Centered icon */}
      <div className="score-card-icon-wrapper">
        <span className="score-card-icon">{getLayerIcon()}</span>
      </div>

      {/* Title and status */}
      <div className="score-card-content">
        <h3 className="score-card-title">{title}</h3>
        <div className="score-band" style={{ color }}>
          <span className="band-icon">{getBandIcon()}</span>
          <span className="band-text">{getBandLabel()}</span>
        </div>
      </div>

      {/* Score percentage indicator */}
      {scorePercent !== null && (
        <div className="score-confidence">
          <div className="confidence-bar-container">
            <div 
              className="confidence-bar-fill"
              style={{ 
                width: `${scorePercent}%`,
                backgroundColor: color
              }}
            />
          </div>
          <span className="confidence-value" style={{ color }}>{scorePercent}%</span>
        </div>
      )}

      {/* Top contributors */}
      {topContributors.length > 0 && (
        <div className="score-contributors">
          {topContributors.map((factor, idx) => (
            <span 
              key={idx} 
              className={`contributor-chip severity-${getSeverityClass(factor.severity)}`}
            >
              {factor.name}
            </span>
          ))}
        </div>
      )}

      {/* Click affordance - always visible on clickable cards */}
      {onClick && (
        <div className="score-card-click-hint">
          <span>View details</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
};

// Helper to classify severity
function getSeverityClass(severity) {
  if (severity >= 0.7) return 'high';
  if (severity >= 0.4) return 'medium';
  return 'low';
}

export default ReportScoreCard;

