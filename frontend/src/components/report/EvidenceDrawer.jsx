import React, { useEffect, useRef } from 'react';
import './EvidenceDrawer.scss';

/**
 * EvidenceDrawer - Slide-out drawer showing evidence details
 * 
 * Props:
 * - open: boolean - Whether drawer is open
 * - evidenceIds: string[] - IDs of evidence to show
 * - evidenceIndex: Record<string, EvidenceItemVM> - Evidence lookup
 * - onClose: () => void - Close callback
 */
const EvidenceDrawer = ({ 
  open = false,
  evidenceIds = [],
  evidenceIndex = {},
  onClose = null
}) => {
  const drawerRef = useRef(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open && onClose) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Get evidence items — only those that actually resolve in the evidence index.
  // An ID with no entry cannot be opened, so it is dropped rather than shown as an
  // empty row (keeps the drawer count honest).
  const evidenceItems = evidenceIds
    .map(id => (evidenceIndex[id] ? { id, ...evidenceIndex[id] } : null))
    .filter(Boolean);

  const truncateSnippet = (snippet, maxLength = 500) => {
    if (!snippet) return null;
    if (snippet.length <= maxLength) return snippet;
    return snippet.substring(0, maxLength) + '...';
  };

  const formatLineRange = (start, end) => {
    if (start === null || start === undefined) return null;
    if (end === null || end === undefined || end === start) return `Line ${start}`;
    return `Lines ${start}-${end}`;
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="evidence-drawer-backdrop"
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        ref={drawerRef}
        className={`evidence-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence Details"
      >
        <div className="drawer-header">
          <h2 className="drawer-title">
            <span className="title-icon">📄</span>
            Evidence Details
            <span className="evidence-count">{evidenceItems.length}</span>
          </h2>
          <button 
            className="close-btn"
            onClick={onClose}
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        <div className="drawer-content">
          {evidenceItems.length === 0 ? (
            <div className="no-evidence">
              <span className="no-evidence-icon">📭</span>
              <p>No evidence found for the selected IDs.</p>
            </div>
          ) : (
            <div className="evidence-list">
              {evidenceItems.map((evidence, idx) => (
                <div key={idx} className="evidence-item">
                  <div className="evidence-header">
                    <code className="evidence-id">{evidence.id}</code>
                    {evidence.toolName && (
                      <span className="tool-badge">
                        {evidence.toolName}
                      </span>
                    )}
                  </div>

                  {evidence.filePath && (
                    <div className="evidence-file">
                      <span className="file-icon">📁</span>
                      <code className="file-path">{evidence.filePath}</code>
                      {formatLineRange(evidence.lineStart, evidence.lineEnd) && (
                        <span className="line-range">
                          {formatLineRange(evidence.lineStart, evidence.lineEnd)}
                        </span>
                      )}
                    </div>
                  )}

                  {evidence.snippet && (
                    <div className="evidence-snippet">
                      <pre><code>{truncateSnippet(evidence.snippet)}</code></pre>
                    </div>
                  )}

                  {evidence.timestamp && (
                    <div className="evidence-timestamp">
                      <span className="timestamp-icon">🕐</span>
                      {new Date(evidence.timestamp).toLocaleString()}
                    </div>
                  )}

                  {evidence.rawData && (
                    <details className="evidence-raw">
                      <summary>Raw Data</summary>
                      <pre><code>{JSON.stringify(evidence.rawData, null, 2)}</code></pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default EvidenceDrawer;

