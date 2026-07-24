import React, { useState } from "react";
import { Info, Trophy, ArrowRight, Github, X } from "lucide-react";
import SEOHead from "../../components/SEOHead";
import { useAuth } from "../../context/AuthContext";
import useGitHubContributors from "../../hooks/useGitHubContributors";
import useReviewQueue from "../../hooks/useReviewQueue";
import LeaderboardTable from "./components/LeaderboardTable";
import ReviewQueuePanel from "./components/ReviewQueuePanel";
import YourImpactPanel from "./components/YourImpactPanel";
import "./LeadershipDashboardPage.scss";

const GITHUB_REPO = "ExtensionShield/ExtensionShield";
const CONTRIBUTOR_LIMIT = 10;
// Maintainer accounts excluded from the public contributor leaderboard.
const CONTRIBUTOR_EXCLUDE = ["Stanfordy", "Stanzin7"];

const TABS = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "queue", label: "Review Queue" },
];

function HowItWorks({ onClose }) {
  return (
    <div className="ldb-howto" role="note">
      <button type="button" className="ldb-howto-close" onClick={onClose} aria-label="Dismiss">
        <X size={16} aria-hidden />
      </button>
      <h3 className="ldb-howto-title">How this dashboard works</h3>
      <ul className="ldb-howto-list">
        <li><strong>Code Contributors</strong> are the real people who build ExtensionShield on GitHub, ranked by commits — live from the public repo.</li>
        <li><strong>Review Queue</strong> holds extension findings flagged for community verification. Sign in to claim and vote on items.</li>
        <li><strong>Community points &amp; verified-review badges</strong> roll out with our karma-on-verify system — we’ll add them here once they reflect real contributions.</li>
      </ul>
    </div>
  );
}

export default function LeadershipDashboardPage() {
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [showHow, setShowHow] = useState(false);
  const { contributors, loading: contributorsLoading } = useGitHubContributors(
    GITHUB_REPO,
    CONTRIBUTOR_LIMIT,
    CONTRIBUTOR_EXCLUDE
  );
  const { items: queueItems, loading: queueLoading } = useReviewQueue();
  const { isAuthenticated, openSignInModal } = useAuth();

  // Entering the review flow (start reviewing, view all, your impact) requires an
  // account — prompt sign-in when signed out, otherwise open the Review Queue tab.
  const enterReview = () => {
    if (isAuthenticated) setActiveTab("queue");
    else openSignInModal();
  };

  return (
    <>
      <SEOHead
        title="Community | ExtensionShield"
        description="You don't need to write code to contribute. Review findings, report suspicious behavior, share evidence, or improve documentation — every contribution helps build a safer web."
        pathname="/community"
      />

      <div className="ldb-page">
        <header className="ldb-header">
          <div className="ldb-header-main">
            <span className="ldb-eyebrow">Community</span>
            <h1 className="ldb-h1">
              Help make browser extensions safer
              <button
                type="button"
                className="ldb-info-btn"
                onClick={() => setShowHow((v) => !v)}
                aria-expanded={showHow}
                aria-label="How it works"
                title="How it works"
              >
                <Info size={24} aria-hidden />
              </button>
            </h1>
            <p className="ldb-tagline">
              You don&apos;t need to write code to contribute. Review findings,
              report suspicious behavior, share evidence, or improve documentation
              — every contribution helps us build a safer web for everyone.
            </p>
          </div>
        </header>

        {showHow && <HowItWorks onClose={() => setShowHow(false)} />}

        <div className="ldb-tabs" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`ldb-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => (t.id === "queue" ? enterReview() : setActiveTab(t.id))}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "leaderboard" ? (
          <div className="ldb-grid">
            <div className="ldb-main-col">
              <LeaderboardTable
                contributors={contributors}
                loading={contributorsLoading}
                onStartReviewing={enterReview}
              />
              <div className="ldb-cta">
                <span className="ldb-cta-icon" aria-hidden><Trophy size={22} /></span>
                <div className="ldb-cta-text">
                  <p className="ldb-cta-title">Help review extension findings</p>
                  <p className="ldb-cta-sub">
                    Claim a flagged finding, add your evidence, and help verify extension risks.
                  </p>
                </div>
                <button
                  type="button"
                  className="ldb-cta-btn"
                  onClick={enterReview}
                >
                  Start reviewing <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            </div>

            <aside className="ldb-side-col">
              <ReviewQueuePanel
                items={queueItems}
                loading={queueLoading}
                variant="preview"
                limit={3}
                onViewFull={enterReview}
              />
              <YourImpactPanel onViewImpact={enterReview} />
            </aside>
          </div>
        ) : (
          <div className="ldb-queue-view">
            <ReviewQueuePanel
              items={queueItems}
              loading={queueLoading}
              variant="full"
              isAuthenticated={isAuthenticated}
              onRequireAuth={openSignInModal}
            />
            <a
              className="ldb-queue-help"
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={15} aria-hidden /> Learn how findings enter the queue
            </a>
          </div>
        )}
      </div>
    </>
  );
}
