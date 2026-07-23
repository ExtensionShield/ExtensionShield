import React from "react";
import { ShieldCheck, Star, CalendarDays, ArrowRight } from "lucide-react";

/**
 * YourImpactPanel — a STATIC showcase card (per product decision). It is not
 * wired to per-user data yet; the real per-account figures arrive with
 * karma-on-verify (Phase B). Days Active counts from Feb 1 of the current year.
 *
 * @param {Function} onViewImpact  handler for the "View impact dashboard" link
 *   (auth-gated by the parent — prompts sign-in when signed out).
 */
const VERIFIED_REVIEWS = "100+";
const POINTS_EARNED = 1480;

function daysSinceFeb1() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 1, 1); // month index 1 = February
  return Math.max(1, Math.floor((now - start) / 86400000));
}

function StatRow({ icon, label, value }) {
  return (
    <div className="imp-row">
      <span className="imp-row-icon" aria-hidden>{icon}</span>
      <span className="imp-row-label">{label}</span>
      <span className="imp-row-value">{value}</span>
    </div>
  );
}

export default function YourImpactPanel({ onViewImpact }) {
  return (
    <section className="ldb-card imp-panel" aria-labelledby="imp-title">
      <header className="ldb-card-head">
        <h2 id="imp-title" className="ldb-card-title">Your Impact</h2>
      </header>

      <div className="imp-rows">
        <StatRow icon={<ShieldCheck size={16} />} label="Verified Reviews" value={VERIFIED_REVIEWS} />
        <StatRow icon={<Star size={16} />} label="Points Earned" value={POINTS_EARNED.toLocaleString()} />
        <StatRow icon={<CalendarDays size={16} />} label="Days Active" value={daysSinceFeb1()} />
      </div>

      {onViewImpact && (
        <button type="button" className="imp-viewlink ldb-link" onClick={onViewImpact}>
          View impact dashboard <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </section>
  );
}
