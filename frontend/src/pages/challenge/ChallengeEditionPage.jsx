import React from "react";
import { Link, Navigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import RainfallDroplets from "../../components/RainfallDroplets";
import { getEdition, CHROME_STORE_URL } from "./editions";
import "./ChallengePage.scss";

/* Inline stroke icons (currentColor) — no external icon font dependency. */
const PATHS = {
  shield: (<><path d="M12 3l7 2.7v5.1c0 4.3-3 7.4-7 8.9-4-1.5-7-4.6-7-8.9V5.7L12 3Z" /><path d="m9 12 2 2 4-4" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>),
  doc: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>),
  cursor: (<><path d="M5 3l6 16 2-6 6-2z" /></>),
  bookmark: (<><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" /></>),
  download: (<><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></>),
  target: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>),
  image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 21" /></>),
  bulb: (<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z" /></>),
  flag: (<><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></>),
  list: (<><path d="M10 6h10" /><path d="M10 12h10" /><path d="M10 18h10" /><path d="m4 6 1.2 1.2L7.5 5" /><path d="m4 12 1.2 1.2L7.5 11" /><path d="m4 18 1.2 1.2L7.5 17" /></>),
  scale: (<><path d="M12 4v16" /><path d="M7 20h10" /><path d="M5 7h14" /><path d="M5 7l-2.4 5a2.5 2.5 0 0 0 4.8 0z" /><path d="M19 7l-2.4 5a2.5 2.5 0 0 0 4.8 0z" /></>),
  trophy: (<><path d="M8 21h8" /><path d="M12 17v4" /><path d="M6 4h12v4a6 6 0 0 1-12 0z" /><path d="M18 5h2.5a1.5 1.5 0 0 1 0 5H18" /><path d="M6 5H3.5a1.5 1.5 0 0 0 0 5H6" /></>),
  pencil: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  usercheck: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></>),
};

const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name] || null}
  </svg>
);

const ChallengeEditionPage = ({ slug }) => {
  const ed = getEdition(slug);
  if (!ed) return <Navigate to="/challenge" replace />;
  const c = ed.content;

  const d = c.details || {};
  const tba = "To be announced";
  const detailRows = [
    { label: "Extensions", value: d.extensions || "Choose 5–10 Chrome Web Store extensions." },
    { label: "Submission deadline", value: d.deadline || ed.schedule.endDate || tba },
    { label: "Eligibility", value: d.eligibility || tba },
    c.enter.submitUrl
      ? { label: "Submit", value: "Open the submission sheet", href: c.enter.submitUrl }
      : { label: "Submit", value: d.submit || tba },
  ];

  const challengeSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `ExtensionShield ${ed.title}`,
    description:
      "A student security challenge: investigate real Chrome Web Store extensions, weigh the evidence, and submit an evidence-backed threat report. No coding required.",
    url: `https://extensionshield.com/challenge/${ed.slug}`,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    organizer: [
      { "@type": "Organization", name: "Nexus Spring of Code" },
      { "@type": "Organization", name: "ExtensionShield", url: "https://extensionshield.com" },
    ],
    ...(ed.schedule.startDate ? { startDate: ed.schedule.startDate } : {}),
    ...(ed.schedule.endDate ? { endDate: ed.schedule.endDate } : {}),
  };

  return (
    <>
      <SEOHead
        title={ed.seo.title}
        description={ed.seo.description}
        pathname={`/challenge/${ed.slug}`}
        keywords="browser extension safety challenge, chrome extension security challenge, threat report challenge, extension permissions, student security challenge"
        schema={challengeSchema}
      />

      <div className="challenge-page">
        <RainfallDroplets />

        <div className="challenge-content">
          <Link to="/challenge" className="challenge-back">← All challenges</Link>

          {/* ---------- LEAD (left-aligned, research-first) ---------- */}
          <header className="edition-lead">
            <p className="edition-eyebrow">{c.eyebrow}</p>
            <h1>{c.heading}</h1>
            <p className="edition-lead-text">{c.lead}</p>
            <div className="research-links">
              <span className="rl-label">Background from our research:</span>
              {c.research.map((r) => (
                <Link key={r.path} to={r.path}>{r.label} →</Link>
              ))}
            </div>
          </header>

          {/* ---------- THE CHALLENGE ---------- */}
          <section className="challenge-section">
            <div className="panel panel--accent">
              <h3 className="panel-title"><span className="ti ti--green"><Icon name="shield" /></span>The challenge</h3>
              <p className="panel-text">{c.challengeIntro}</p>
              <div className="challenge-cta challenge-cta--left">
                <Link to="/scan" className="btn btn--primary">Open the scanner</Link>
                <a href="#playbook" className="btn btn--ghost">See how it works</a>
              </div>
            </div>
          </section>

          {/* ---------- HOW IT WORKS ---------- */}
          <section className="challenge-section" id="playbook">
            <h2>{c.playbookHeading}</h2>
            <p className="section-intro">{c.playbookIntro}</p>
            <div className="steps-grid">
              {c.howItStarts.map((s) => (
                <div key={s.n} className="step-card">
                  <span className="step-no">{s.n}</span>
                  <span className="step-icon" style={{ color: s.color }}><Icon name={s.icon} /></span>
                  <h4>{s.title}</h4>
                  <p>{s.text}</p>
                  <span className="step-bar" style={{ background: s.color }} />
                </div>
              ))}
            </div>
          </section>

          {/* ---------- MISSION + RISK ---------- */}
          <section className="challenge-section">
            <div className="two-col">
              <div className="panel">
                <h3 className="panel-title">The 5-step mission</h3>
                <ol className="mission-list">
                  {c.mission.map((m) => (
                    <li key={m.n} className="mission-item">
                      <span className="mission-num">{m.n}</span>
                      <div>
                        <b>{m.title}</b>
                        <p>{m.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="panel">
                <h3 className="panel-title">Risk classification</h3>
                <div className="risk-list">
                  {c.risks.map((r) => (
                    <div key={r.level} className={`risk-row risk-row--${r.variant}`}>
                      <span className="risk-dot" />
                      <div className="risk-body">
                        <div className="risk-head">
                          <span className="risk-level">{r.level}</span>
                          <span className="risk-rec">{r.rec}</span>
                        </div>
                        <p>{r.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="risk-note">{c.riskNote}</p>
              </div>
            </div>
          </section>

          {/* ---------- JUDGING ---------- */}
          <section className="challenge-section">
            <div className="panel">
              <h3 className="panel-title">What judges look for</h3>
              <div className="judges-grid">
                {c.judges.map((j) => (
                  <div key={j.title} className="judge-item">
                    <span className="ti ti--green"><Icon name={j.icon} /></span>
                    <div>
                      <b>{j.title}</b>
                      <p>{j.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- INSTALL THE EXTENSION (SAFETY) ---------- */}
          <section className="challenge-section">
            <div className="panel panel--soft">
              <div className="panel-head">
                <h3 className="panel-title"><span className="ti ti--green"><Icon name="cursor" /></span>{c.extensionHeading}</h3>
                <span className="tag-optional">Optional</span>
              </div>
              <p className="panel-text ext-lead">{c.extensionLead}</p>
              <div className="features-grid">
                {c.features.map((f) => (
                  <div key={f.title} className="feature-item">
                    <span className="ti ti--green"><Icon name={f.icon} /></span>
                    <div>
                      <b>{f.title}</b>
                      <span>{f.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              <a className="link-inline" href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                Add ExtensionShield to Chrome ↗
              </a>
            </div>
          </section>

          {/* ---------- SIGN IN TO ENTER ---------- */}
          <section className="challenge-section">
            <div className="panel">
              <h3 className="panel-title"><span className="ti ti--green"><Icon name="usercheck" /></span>Sign in to enter</h3>
              <p className="panel-text ext-lead">{c.enter.intro}</p>
              <div className="enter-points">
                {c.enter.points.map((p) => (
                  <div key={p.title} className="enter-point">
                    <span className="ti ti--green"><Icon name={p.icon} /></span>
                    <div>
                      <b>{p.title}</b>
                      <p>{p.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="panel-text enter-submit">{c.enter.submit}</p>
              {c.enter.submitUrl ? (
                <a className="btn btn--ghost btn--sm" href={c.enter.submitUrl} target="_blank" rel="noopener noreferrer">
                  Open the submission sheet ↗
                </a>
              ) : null}
            </div>
          </section>

          {/* ---------- INTEGRITY + PRIZES ---------- */}
          <section className="challenge-section">
            <div className="two-col">
              <div className="panel">
                <h3 className="panel-title"><span className="ti ti--green"><Icon name="scale" /></span>Submission integrity</h3>
                {c.integrity.map((para, i) => (
                  <p key={i} className="panel-text" style={i ? { marginTop: "0.7rem" } : undefined}>{para}</p>
                ))}
              </div>
              <div className="panel panel--prize">
                <h3 className="panel-title"><span className="ti ti--gold"><Icon name="trophy" /></span>{c.prizeTitle}</h3>
                {c.prizes.map((para, i) => (
                  <p key={i} className="panel-text" style={i ? { marginTop: "0.7rem" } : undefined}>{para}</p>
                ))}
                {c.prizeTiers && c.prizeTiers.length > 0 ? (
                  <div className="medals">
                    {c.prizeTiers.map((t) => <span key={t}>{t}</span>)}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {/* ---------- BEFORE YOU SUBMIT ---------- */}
          <section className="challenge-section">
            <div className="panel panel--soft">
              <h3 className="panel-title"><span className="ti ti--blue"><Icon name="pencil" /></span>Before you submit</h3>
              <p className="panel-text">{c.beforeSubmit}</p>
            </div>
          </section>

          {/* ---------- CHALLENGE DETAILS ---------- */}
          <section className="challenge-section">
            <div className="panel">
              <h3 className="panel-title"><span className="ti ti--green"><Icon name="list" /></span>Challenge details</h3>
              <dl className="details-list">
                {detailRows.map((r) => (
                  <div key={r.label} className="details-row">
                    <dt>{r.label}</dt>
                    <dd>
                      {r.href ? (
                        <a href={r.href} target="_blank" rel="noopener noreferrer">{r.value} ↗</a>
                      ) : (
                        r.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default ChallengeEditionPage;
