import React, { useState } from "react";
import "./ResultFeedback.scss";

/**
 * ResultFeedback - Minimal per-scan feedback (top-right of extension card)
 * "Helpful" signal + thumbs up/down icons. Negative feedback expands as popover.
 */

const FEEDBACK_REASONS = [
  { value: "false_positive", label: "False positive" },
  { value: "false_negative", label: "False negative" },
  { value: "score_off", label: "Score seems wrong" },
  { value: "unclear", label: "Results unclear" },
  { value: "other", label: "Other" },
];

const ResultFeedback = ({ scanId }) => {
  const [state, setState] = useState("initial");
  const [reason, setReason] = useState(null);
  const [suggestedScore, setSuggestedScore] = useState(50);
  const [comment, setComment] = useState("");
  // Only the setter is used (cleared/!set during submit flow); the message is
  // not currently surfaced in the UI.
  const [, setErrorMessage] = useState("");

  const baseURL = import.meta.env.VITE_API_URL || "";

  const submitFeedback = async (isHelpful, feedbackReason = null) => {
    setState("submitting");
    setErrorMessage("");

    const payload = {
      scan_id: scanId,
      helpful: isHelpful,
    };
    if (!isHelpful && feedbackReason) {
      payload.reason = feedbackReason;
      if (feedbackReason === "score_off") payload.suggested_score = suggestedScore;
      if (feedbackReason === "other" && comment.trim()) payload.comment = comment.trim().slice(0, 280);
    }

    try {
      const res = await fetch(`${baseURL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) setState("success");
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.detail || "Failed to submit");
        setState("error");
      }
    } catch {
      setErrorMessage("Network error");
      setState("error");
    }
  };

  const handleThumbsUp = () => submitFeedback(true);
  const handleThumbsDown = () => setState("expanded");
  const handleSubmitNegative = () => {
    if (!reason) return;
    submitFeedback(false, reason);
  };
  const handleReset = () => {
    setState("initial");
    setReason(null);
    setSuggestedScore(50);
    setComment("");
    setErrorMessage("");
  };

  // Success — minimal check
  if (state === "success") {
    return (
      <div className="result-feedback result-feedback--compact result-feedback--success">
        <span className="result-feedback__check">✓</span>
        <span className="result-feedback__thanks">Thanks</span>
      </div>
    );
  }

  // Error — minimal retry
  if (state === "error") {
    return (
      <div className="result-feedback result-feedback--compact result-feedback--error">
        <button type="button" className="result-feedback__retry-btn" onClick={handleReset}>
          Try again
        </button>
      </div>
    );
  }

  // Submitting
  if (state === "submitting") {
    return (
      <div className="result-feedback result-feedback--compact result-feedback--submitting">
        <span className="result-feedback__spinner" />
      </div>
    );
  }

  // Expanded — popover
  if (state === "expanded") {
    return (
      <div className="result-feedback result-feedback--compact">
        <div className="result-feedback__row">
          <span className="result-feedback__signal">Helpful</span>
          <span className="result-feedback__icons">
            <button type="button" className="result-feedback__circle" onClick={handleReset} title="Cancel">✕</button>
          </span>
        </div>
        <div className="result-feedback__popover">
          <span className="result-feedback__popover-title">What went wrong?</span>
          <div className="result-feedback__reasons">
            {FEEDBACK_REASONS.map((r) => (
              <label key={r.value} className="result-feedback__reason">
                <input
                  type="radio"
                  name="feedback-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
          {reason === "score_off" && (
            <div className="result-feedback__score-row">
              <span>Expected score: {suggestedScore}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={suggestedScore}
                onChange={(e) => setSuggestedScore(parseInt(e.target.value, 10))}
                className="result-feedback__slider"
              />
            </div>
          )}
          {reason === "other" && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional, max 280 chars"
              maxLength={280}
              rows={2}
              className="result-feedback__textarea"
            />
          )}
          <div className="result-feedback__popover-actions">
            <button type="button" className="result-feedback__popover-btn" onClick={handleReset}>Cancel</button>
            <button type="button" className="result-feedback__popover-btn result-feedback__popover-btn--primary" onClick={handleSubmitNegative} disabled={!reason}>Submit</button>
          </div>
        </div>
      </div>
    );
  }

  // Initial — minimal: Helpful + ↑ ↓
  return (
    <div className="result-feedback result-feedback--compact">
      <div className="result-feedback__row">
        <span className="result-feedback__signal">Helpful</span>
        <span className="result-feedback__icons">
          <button type="button" className="result-feedback__circle" onClick={handleThumbsUp} title="Yes, helpful">👍</button>
          <button type="button" className="result-feedback__circle" onClick={handleThumbsDown} title="No, not helpful">👎</button>
        </span>
      </div>
    </div>
  );
};

export default ResultFeedback;
