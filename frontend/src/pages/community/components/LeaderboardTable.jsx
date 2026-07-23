import React, { useState } from "react";
import { Trophy, ShieldCheck, ArrowRight, Star } from "lucide-react";

const GITHUB_REPO = "ExtensionShield/ExtensionShield";

/**
 * LeaderboardTable — a category-switchable community leaderboard.
 *
 * Categories (extensible — add more to CATEGORIES):
 *  - "code"    → Code Contributions: real GitHub contributors ranked by commits
 *               (live, via useGitHubContributors passed in as `contributors`).
 *  - "reviews" → Extension Reviews: points earned by volunteering to review
 *               flagged extensions. No data yet (points arrive with
 *               karma-on-verify, Phase B), so this shows an honest placeholder —
 *               never fabricated reviewer rows.
 *
 * Point/score CALCULATION is intentionally deferred (Phase B). This component
 * only establishes the category UI + honest states.
 */
const CATEGORIES = [
  { id: "code", label: "Code Contributions" },
  { id: "reviews", label: "Extension Reviews" },
];

function RankCell({ index }) {
  const rank = index + 1;
  if (rank <= 3) {
    const cls = ["gold", "silver", "bronze"][index];
    return (
      <span className={`ldb-rank ldb-rank--${cls}`} aria-label={`Rank ${rank}`}>
        <Trophy size={18} aria-hidden />
      </span>
    );
  }
  return <span className="ldb-rank ldb-rank--num">{rank}</span>;
}

function Avatar({ contributor }) {
  const [ok, setOk] = useState(Boolean(contributor.avatar));
  if (ok) {
    return (
      <img
        className="ldb-avatar"
        src={contributor.avatar}
        alt=""
        loading="lazy"
        onError={() => setOk(false)}
      />
    );
  }
  return (
    <span className="ldb-avatar ldb-avatar--initial" aria-hidden>
      {(contributor.login || "?").charAt(0).toUpperCase()}
    </span>
  );
}

function CodeContributors({ contributors, loading }) {
  const isEmpty = !loading && contributors.length === 0;
  return (
    <div className="ldb-table-wrap">
      <table className="ldb-table">
        <thead>
          <tr>
            <th className="ldb-col-rank">Rank</th>
            <th className="ldb-col-user">Contributor</th>
            <th className="ldb-col-num">Commits</th>
            <th className="ldb-col-badge">Badge</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`} className="ldb-row ldb-row--skeleton" aria-hidden>
                <td><span className="ldb-sk ldb-sk-rank" /></td>
                <td>
                  <span className="ldb-user">
                    <span className="ldb-avatar ldb-sk ldb-sk-avatar" />
                    <span className="ldb-sk ldb-sk-line" />
                  </span>
                </td>
                <td><span className="ldb-sk ldb-sk-num" /></td>
                <td><span className="ldb-sk ldb-sk-badge" /></td>
              </tr>
            ))}

          {!loading &&
            contributors.map((c, i) => (
              <tr key={c.id} className="ldb-row">
                <td className="ldb-col-rank"><RankCell index={i} /></td>
                <td className="ldb-col-user">
                  <a
                    className="ldb-user"
                    href={c.profileUrl || `https://github.com/${c.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Avatar contributor={c} />
                    <span className="ldb-user-text">
                      <span className="ldb-user-name">{c.login}</span>
                      <span className="ldb-user-handle">@{c.login}</span>
                    </span>
                  </a>
                </td>
                <td className="ldb-col-num ldb-num">{(c.contributions || 0).toLocaleString()}</td>
                <td className="ldb-col-badge">
                  <span className="ldb-badge">
                    <ShieldCheck size={13} aria-hidden /> Contributor
                  </span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {isEmpty && (
        <div className="ldb-empty">
          Couldn&apos;t load contributors right now.{" "}
          <a
            className="ldb-link"
            href={`https://github.com/${GITHUB_REPO}/graphs/contributors`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub <ArrowRight size={13} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

function ReviewsLeaderboard({ onStartReviewing }) {
  return (
    <div className="ldb-reviews-empty">
      <span className="ldb-reviews-icon" aria-hidden><Star size={22} /></span>
      <p className="ldb-reviews-title">Reviewer rankings are coming</p>
      <p className="ldb-reviews-sub">
        Volunteer to review flagged extensions and earn points. Some quietly read
        your cookies and personal data — every review keeps the community safe.
        We&apos;re the wall of defence against them.
      </p>
      {onStartReviewing && (
        <button type="button" className="ldb-link ldb-reviews-cta" onClick={onStartReviewing}>
          Go to the Review Queue <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

export default function LeaderboardTable({ contributors, loading, onStartReviewing }) {
  const [category, setCategory] = useState("code");
  const isCode = category === "code";

  return (
    <section className="ldb-card ldb-leaderboard" aria-labelledby="ldb-leaderboard-title">
      <h2 id="ldb-leaderboard-title" className="ldb-sr-only">Community leaderboard</h2>
      <header className="ldb-card-head ldb-lead-head">
        <div className="ldb-cat-tabs" role="tablist" aria-label="Leaderboard category">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={`ldb-cat-tab ${category === c.id ? "active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {isCode ? (
        <CodeContributors contributors={contributors} loading={loading} />
      ) : (
        <ReviewsLeaderboard onStartReviewing={onStartReviewing} />
      )}
    </section>
  );
}
