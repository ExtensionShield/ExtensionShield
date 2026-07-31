import React from "react";
import "./ArticleBlocks.scss";

/**
 * Structured article renderer.
 *
 * WHY: research-grade posts need tables, code, callouts and stat rows. The old
 * blog model was `sections: [{ heading, body }]` where `body` was a single
 * plain string, so a post could never be more than a run of paragraphs. That
 * capped every post at roughly three paragraphs of prose.
 *
 * Content is authored as data (see src/data/articles/*.js), never as HTML strings —
 * nothing here uses dangerouslySetInnerHTML, so post data can never inject
 * markup into the page.
 *
 * Supported block types. Anything else renders nothing (and warns in dev) so a
 * malformed block degrades to a gap instead of crashing the page:
 *
 *   { type: "p",       text }
 *   { type: "h3",      text }
 *   { type: "list",    ordered?, items: [] }
 *   { type: "table",   caption?, columns: [], rows: [[]] }
 *   { type: "code",    language?, caption?, code }
 *   { type: "callout", variant: "note"|"warning"|"key", title?, text }
 *   { type: "stat",    items: [{ value, label }] }
 *   { type: "steps",   items: [{ title, text }] }
 */

const CALLOUT_LABEL = {
  note: "Note",
  warning: "Caution",
  key: "Key finding",
};

function Block({ block }) {
  if (!block || typeof block !== "object") return null;

  switch (block.type) {
    case "p":
      return <p className="article-p">{block.text}</p>;

    case "h3":
      return <h3 className="article-h3">{block.text}</h3>;

    case "list": {
      const items = Array.isArray(block.items) ? block.items : [];
      if (!items.length) return null;
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag className={`article-list ${block.ordered ? "ordered" : "bulleted"}`}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );
    }

    case "table": {
      const columns = Array.isArray(block.columns) ? block.columns : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      if (!columns.length || !rows.length) return null;
      return (
        <figure className="article-table-figure">
          {/* Wide tables scroll inside their own container so the page body
              never scrolls horizontally on mobile. */}
          <div className="article-table-scroll" tabIndex={0} role="group" aria-label={block.caption || "Data table"}>
            <table className="article-table">
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} scope="col">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr key={r}>
                    {(Array.isArray(row) ? row : []).map((cell, c) =>
                      c === 0 ? (
                        <th key={c} scope="row">
                          {cell}
                        </th>
                      ) : (
                        <td key={c}>{cell}</td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }

    case "code": {
      if (!block.code) return null;
      return (
        <figure className="article-code-figure">
          <div className="article-code-head">
            <span className="article-code-lang">{block.language || "text"}</span>
          </div>
          <pre className="article-code" tabIndex={0}>
            <code>{block.code}</code>
          </pre>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }

    case "callout": {
      const variant = CALLOUT_LABEL[block.variant] ? block.variant : "note";
      return (
        <aside className={`article-callout ${variant}`}>
          <span className="article-callout-tag">{CALLOUT_LABEL[variant]}</span>
          <div className="article-callout-body">
            {block.title && <strong className="article-callout-title">{block.title}</strong>}
            {block.text && <p>{block.text}</p>}
          </div>
        </aside>
      );
    }

    case "stat": {
      const items = Array.isArray(block.items) ? block.items : [];
      if (!items.length) return null;
      return (
        <dl className="article-stats">
          {items.map((item, i) => (
            <div className="article-stat" key={i}>
              <dt className="article-stat-value">{item.value}</dt>
              <dd className="article-stat-label">{item.label}</dd>
            </div>
          ))}
        </dl>
      );
    }

    case "steps": {
      const items = Array.isArray(block.items) ? block.items : [];
      if (!items.length) return null;
      return (
        <ol className="article-steps">
          {items.map((item, i) => (
            <li key={i}>
              {item.title && <strong className="article-step-title">{item.title}</strong>}
              {item.text && <span className="article-step-text">{item.text}</span>}
            </li>
          ))}
        </ol>
      );
    }

    default:
      if (import.meta.env?.DEV) {
        console.warn(`[ArticleBlocks] unknown block type: ${JSON.stringify(block.type)}`);
      }
      return null;
  }
}

const ArticleBlocks = ({ blocks }) => {
  if (!Array.isArray(blocks)) return null;
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
};

export default ArticleBlocks;
