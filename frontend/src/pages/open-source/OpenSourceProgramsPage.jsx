import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import RainfallDroplets from "../../components/RainfallDroplets";
import "./OpenSourceProgramsPage.scss";

/**
 * Open Source Programs hub: programs applied for 2026 (GSoC, etc.).
 * Each program links to its detail page (e.g. GSoC → /gsoc/ideas).
 */
const PROGRAMS = [
  {
    id: "gsoc",
    name: "Google Summer of Code",
    description: "Project ideas for GSoC contributors. ExtensionShield ideas: extension security, SAST, and community tooling.",
    status: "",
    statusVariant: "", // applied | rejected | accepted | partner
    path: "/gsoc/ideas",
    icon: "☀️",
    iconClass: "gsoc",
  },
  {
    id: "nexus-spring",
    name: "Nexus Spring of Code",
    description: "A 60-day open-source program where maintainers bring real projects and contributors ship production-ready code. ExtensionShield runs the Threat Report Challenge as part of NSoC'26.",
    status: "",
    statusVariant: "",
    path: "/challenge",
    icon: "🛡️",
    iconClass: "nexus",
  },
  // Add more programs here, e.g.:
  // { id: "outreachy", name: "Outreachy", description: "...", status: "Rejected", statusVariant: "rejected", path: "/open-source/outreachy", icon: "🌍", iconClass: "outreachy" },
];

const OpenSourceProgramsPage = () => {
  return (
    <>
      <SEOHead
        title="Open Source Programs & Events 2026 | ExtensionShield"
        description="Open-source and community programs and events ExtensionShield takes part in for 2026: Google Summer of Code, the Nexus Spring of Code challenge, and more. Explore project ideas and how to get involved."
        pathname="/open-source/programs"
        keywords="open source programs 2026, Google Summer of Code, GSoC, Nexus Spring of Code, extension security challenge, open source contribution"
      />

      <div className="open-source-programs-page">
        <RainfallDroplets />

        <div className="open-source-programs-content">
          <header className="open-source-programs-header">
            <div className="oss-badge">🌱 Programs &amp; Events</div>
            <h1>Programs &amp; Events for 2026</h1>
            <p>
              Programs and events ExtensionShield takes part in for 2026 — from mentorship programs
              we&apos;ve applied to, to challenges we run with partners. Select one to learn more.
            </p>
          </header>

          <div className="programs-grid">
            {PROGRAMS.map((program) => (
              <Link key={program.id} to={program.path} className="program-card">
                <div className={`program-icon ${program.iconClass}`}>{program.icon}</div>
                <div className="program-content">
                  <h3>{program.name}</h3>
                  <p>{program.description}</p>
                  {program.status ? (
                    <span className={`program-status program-status--${program.statusVariant}`}>
                      {program.status}
                    </span>
                  ) : null}
                </div>
                <span className="arrow">→</span>
              </Link>
            ))}
          </div>

          <p className="programs-note">
            Additional 2026 programs may be listed as applications are submitted. Have a program to suggest?{" "}
            <Link to="/community#connect">Join our community</Link> or open an issue on GitHub.
          </p>
        </div>
      </div>
    </>
  );
};

export default OpenSourceProgramsPage;
