import React from 'react';
import { Info } from 'lucide-react';
import './SimilarExtensions.scss';

/**
 * SimilarExtensions — an OPTIONAL, clearly-secondary informational card.
 *
 * It is purely contextual: it never influences the verdict, score, or summary,
 * and it says so. When the payload carries no similar-extension data the section
 * is omitted entirely rather than showing an empty or fabricated list.
 *
 * `items`: Array<{ extensionId?, name, users?, rating?, iconUrl? }>
 */
const SimilarExtensions = ({ items }) => {
  const list = Array.isArray(items) ? items.filter((x) => x && x.name) : [];
  if (list.length === 0) return null;

  const formatUsers = (n) => {
    if (n == null) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M+ users`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K+ users`;
    return `${n} users`;
  };

  return (
    <section className="similar-extensions" aria-labelledby="similar-extensions-heading">
      <div className="similar-extensions-head">
        <h3 id="similar-extensions-heading" className="similar-extensions-title">
          Similar Extensions
          <span className="similar-extensions-tag">
            <Info size={12} aria-hidden="true" /> Informational
          </span>
        </h3>
        <p className="similar-extensions-note">Context only — not used in this verdict.</p>
      </div>

      <ul className="similar-extensions-list">
        {list.map((item, i) => (
          <li className="similar-extensions-item" key={item.extensionId || `${item.name}-${i}`}>
            {item.iconUrl
              ? <img className="similar-ext-icon" src={item.iconUrl} alt="" loading="lazy" />
              : <span className="similar-ext-icon similar-ext-icon--placeholder" aria-hidden="true" />}
            <span className="similar-ext-body">
              <span className="similar-ext-name">{item.name}</span>
              {(formatUsers(item.users) || item.rating != null) && (
                <span className="similar-ext-meta">
                  {formatUsers(item.users)}
                  {formatUsers(item.users) && item.rating != null ? ' · ' : ''}
                  {item.rating != null ? `★ ${Number(item.rating).toFixed(1)}` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SimilarExtensions;
