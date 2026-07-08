import React from 'react';
import { resolveVerdictBadge } from '../../utils/signalMapper';
import './RiskVerdictBadge.scss';

/**
 * RiskVerdictBadge — the authoritative verdict badge for scan list rows, plus an
 * OPTIONAL, SEPARATE provenance chip.
 *
 * Rules:
 * - The badge label/color come ONLY from the verdict (via resolveVerdictBadge):
 *   ALLOW -> Safe, NEEDS_REVIEW -> Review, BLOCK -> Blocked. Score band is a
 *   fallback that never upgrades to Safe.
 * - Listing trust never replaces or recolors the verdict badge — it renders as
 *   its own small secondary chip so an ALLOW stays visibly Safe while the
 *   listing caveat is still shown.
 * - `warnings` (from resolveRowProvenance) carries specific caveats (Edge
 *   listing, version mismatch, missing metadata, unverified URL). To avoid
 *   density, only ONE chip renders: the first warning, with the full list in
 *   the tooltip. `unverified` is the boolean fallback for callers without
 *   payload-level provenance.
 */
const RiskVerdictBadge = ({ level, score, decision, unverified = false, warnings = [] }) => {
  const { label, colorClass, hex } = resolveVerdictBadge({ decision, level, score });
  const provenanceWarnings = Array.isArray(warnings) && warnings.length > 0
    ? warnings
    : (unverified ? ['Unverified listing'] : []);

  return (
    <div className="risk-verdict-badge">
      <div
        className={`risk-badge ${colorClass}`}
        style={{ borderColor: hex, color: hex }}
      >
        <span className="risk-level">{label}</span>
      </div>
      {provenanceWarnings.length > 0 && (
        <span className="provenance-chip" title={provenanceWarnings.join(' · ')}>
          {provenanceWarnings[0]}
          {provenanceWarnings.length > 1 && ` +${provenanceWarnings.length - 1}`}
        </span>
      )}
    </div>
  );
};

export default RiskVerdictBadge;
