import React from 'react';
import { ChevronRight } from 'lucide-react';
import './ResultsSidebarTile.scss';

/**
 * ResultsSidebarTile - Right sidebar tile for Security/Privacy/Governance
 * Shows verdict pill + findings count. Click to expand details.
 */
const ResultsSidebarTile = ({
  title = 'Layer',
  score = null,
  band = 'NA',
  findingsCount = 0,
  contributors = [],
  icon = null,
  onClick = null
}) => {
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

  const topContributors = (Array.isArray(contributors) ? contributors : [])
    .filter((factor) => factor && factor.name)
    .slice(0, 2);

  return (
    <div
      className={`results-sidebar-tile band-${band.toLowerCase()} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      <div className="tile-header">
        <div className="tile-heading">
          <span className="tile-icon">{getLayerIcon()}</span>
          <h3 className="tile-title">{title}</h3>
        </div>
        <span className="tile-score">
          {score === null ? '—' : Math.round(score)}
          <small>/100</small>
        </span>
        {onClick && <ChevronRight className="tile-chevron" size={16} />}
      </div>

      <div className="tile-verdict-row">
        <span className={`tile-pill tile-pill-${band.toLowerCase()}`}>
          <span className="pill-icon">{getBandIcon()}</span>
          {getBandLabel()}
        </span>
        {findingsCount > 0 && (
          <span className={`tile-findings-badge tile-findings-badge--${band.toLowerCase()}`}>
            <span className="tile-findings-dot" aria-hidden />
            {findingsCount} {findingsCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      {topContributors.length > 0 && (
        <div className="tile-contributors">
          {topContributors.map((factor, index) => (
            <span key={`${factor.name}-${index}`} className="tile-contributor-chip">
              {factor.name}
            </span>
          ))}
        </div>
      )}

      <div className="tile-progress">
        <div
          className="tile-progress-fill"
          style={{ width: `${score === null ? 0 : Math.round(score)}%`, backgroundColor: 'var(--tile-band-color)' }}
        />
      </div>
    </div>
  );
};

export default ResultsSidebarTile;
