import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ChevronLeft, ArrowRight, Puzzle, Inbox } from "lucide-react";

/**
 * ReviewQueuePanel — community review queue (scanned extensions awaiting review),
 * sourced from /api/recent. Empty state when the backend is unreachable.
 *
 * Full variant paginates 10 per page. Page 1 is public; navigating to further
 * pages requires an account, so `goToPage` calls `onRequireAuth` when signed out.
 *
 * @param {Array}    items          queue items from useReviewQueue
 * @param {boolean}  loading
 * @param {"preview"|"full"} variant  preview = sidebar (top N + "view full"), full = paginated
 * @param {number}   limit          max items in preview mode
 * @param {Function} onViewFull     switches to the full Review Queue tab
 * @param {boolean}  isAuthenticated
 * @param {Function} onRequireAuth  prompts sign-in when a signed-out user paginates
 */
const PAGE_SIZE = 10;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function severityClass(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "high" || s === "critical") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function ExtIcon({ item }) {
  const [ok, setOk] = useState(Boolean(item.iconUrl));
  if (ok) {
    return (
      <img
        className="rq-item-icon rq-item-icon--img"
        src={item.iconUrl}
        alt=""
        loading="lazy"
        onError={() => setOk(false)}
      />
    );
  }
  return (
    <span className="rq-item-icon" aria-hidden><Puzzle size={16} /></span>
  );
}

function QueueItem({ item }) {
  const sev = severityClass(item.severity);
  const href = `/scan/results/${item.slug || item.extension_id}`;
  return (
    <li className="rq-item">
      <Link to={href} className="rq-item-link">
        <ExtIcon item={item} />
        <span className="rq-item-body">
          <span className="rq-item-name">{item.extension_name || item.extension_id || "Unknown extension"}</span>
          <span className="rq-item-meta">
            <span className={`rq-sev rq-sev--${sev}`}>
              <span className="rq-sev-dot" aria-hidden />
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </span>
            <span className="rq-item-finding">{item.finding_type || "Security scan"}</span>
          </span>
        </span>
        <ChevronRight size={16} className="rq-item-chev" aria-hidden />
      </Link>
    </li>
  );
}

export default function ReviewQueuePanel({
  items = [],
  loading,
  variant = "preview",
  limit = 3,
  onViewFull,
  isAuthenticated = false,
  onRequireAuth,
}) {
  const [page, setPage] = useState(0);

  const sorted = [...items].sort(
    (a, b) => (SEVERITY_ORDER[severityClass(a.severity)] ?? 3) - (SEVERITY_ORDER[severityClass(b.severity)] ?? 3)
  );
  const isEmpty = !loading && items.length === 0;
  const isFull = variant === "full";
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const shown = isFull
    ? sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : sorted.slice(0, limit);

  // Page 1 is public; paging further requires an account.
  const goToPage = (p) => {
    if (p < 0 || p > totalPages - 1 || p === safePage) return;
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    setPage(p);
  };

  return (
    <section className="ldb-card rq-panel" aria-labelledby="rq-title">
      <header className="ldb-card-head">
        <h2 id="rq-title" className="ldb-card-title">Review Queue</h2>
        {!loading && items.length > 0 && <span className="rq-count">{items.length}</span>}
      </header>

      {loading && (
        <ul className="rq-list" aria-hidden>
          {Array.from({ length: variant === "preview" ? limit : 4 }).map((_, i) => (
            <li key={`rqs-${i}`} className="rq-item rq-item--skeleton">
              <span className="rq-item-icon ldb-sk" />
              <span className="rq-item-body">
                <span className="ldb-sk ldb-sk-line" />
                <span className="ldb-sk ldb-sk-line ldb-sk-line--short" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {isEmpty && (
        <div className="rq-empty">
          <Inbox size={22} aria-hidden />
          <p className="rq-empty-title">No extensions to review yet</p>
          <p className="rq-empty-sub">
            Scanned extensions awaiting community review will appear here.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <ul className="rq-list">
            {shown.map((item) => (
              <QueueItem key={item.id} item={item} />
            ))}
          </ul>

          {variant === "preview" && (
            <button type="button" className="rq-viewall ldb-link" onClick={onViewFull}>
              View full queue <ArrowRight size={14} aria-hidden />
            </button>
          )}

          {isFull && totalPages > 1 && (
            <nav className="rq-pagination" aria-label="Review queue pages">
              <button
                type="button"
                className="rq-page-arrow"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage === 0}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <div className="rq-page-nums">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`rq-page-num ${i === safePage ? "active" : ""}`}
                    onClick={() => goToPage(i)}
                    aria-current={i === safePage ? "page" : undefined}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="rq-page-arrow"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage === totalPages - 1}
                aria-label="Next page"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
