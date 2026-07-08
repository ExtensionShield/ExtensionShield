import React, { useState } from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import DonutScore from "../../components/report/DonutScore";
import { getBandFromScore } from "../../constants/riskBands";
import { Dialog, DialogContent, DialogTrigger } from "../../components/ui/dialog";
import { Info } from "lucide-react";
import "./MethodologyPage.scss";

const CANONICAL_DOMAIN = "https://extensionshield.com";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": `${CANONICAL_DOMAIN}/` },
    { "@type": "ListItem", "position": 2, "name": "Research", "item": `${CANONICAL_DOMAIN}/research` },
    { "@type": "ListItem", "position": 3, "name": "Methodology", "item": `${CANONICAL_DOMAIN}/research/methodology` }
  ]
};

const MethodologyPage = () => {
  const [openSourceModalOpen, setOpenSourceModalOpen] = useState(false);

  return (
    <>
      <SEOHead
        title="Chrome Extension Risk Score & Security Analysis Methodology | ExtensionShield"
        description="How we calculate chrome extension risk score: static analysis, threat intelligence, and extension security analysis. Transparent methodology for auditing chrome extension security."
        pathname="/research/methodology"
        schema={[breadcrumbSchema]}
      />

      <div className="methodology-page">
        <div className="methodology-content">
          {/* Breadcrumb */}
          <nav className="breadcrumb">
            <Link to="/research">Research</Link>
            <span>/</span>
            <span>How We Score</span>
          </nav>

          <header className="methodology-header">
            <h1>How We Analyze Extensions</h1>
            <p className="subtitle">
              Three independent analysis layers combine into one extension risk score.
            </p>
          </header>

          {/* Aggregate Score - Showing End Result First */}
          <div className="aggregate-card">
            <div className="aggregate-header">
              <h2>Aggregate Risk Score</h2>
              <p>All three dimensions combined into one actionable metric</p>
            </div>
            <div className="aggregate-risk-display">
              <DonutScore
                score={83}
                band={getBandFromScore(83)}
                size={280}
                label="OVERALL"
              />
              <span className="illustrative-label">Illustrative example</span>
            </div>
            <div className="aggregate-formula">
              <div className="formula-item">
                <span className="formula-label">Security</span>
                <span className="formula-weight">× 34%</span>
              </div>
              <span className="formula-plus">+</span>
              <div className="formula-item">
                <span className="formula-label">Privacy</span>
                <span className="formula-weight">× 33%</span>
              </div>
              <span className="formula-plus">+</span>
              <div className="formula-item">
                <span className="formula-label">Governance</span>
                <span className="formula-weight">× 33%</span>
              </div>
            </div>
          </div>

          {/* Section Divider */}
          <div className="methodology-divider">
            <h2>How We Get There</h2>
            <p>Three independent security pipelines work together</p>
          </div>

          {/* Three Pipeline Flow */}
          <div className="pipeline-flow">
            {/* Pipeline 1: SAST (Open Source) */}
            <div className="pipeline-card">
              <div className="pipeline-number">01</div>
              <div className="pipeline-content">
                <div className="pipeline-left">
                  <div className="pipeline-icon security">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="pipeline-details">
                    <div className="pipeline-badge-row">
                      <div className="pipeline-badge open-source">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                        OPEN SOURCE
                      </div>
                      <Dialog open={openSourceModalOpen} onOpenChange={setOpenSourceModalOpen}>
                        <DialogTrigger asChild>
                          <button
                            type="button"
                            className="pipeline-open-source-trigger"
                            aria-label="Open source credit — based on ThreatXtension"
                          >
                            <Info className="pipeline-open-source-trigger-icon" aria-hidden />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="methodology-open-source-dialog">
                          <div className="open-source-credit open-source-credit--modal">
                            <div className="credit-icon">
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                              </svg>
                            </div>
                            <h3>Built on Open Source</h3>
                            <p>
                              ExtensionShield began as a derivative of <strong>ThreatXtension</strong>
                              (open-source, MIT per its README). Pipeline 1, our Security (SAST) pipeline, builds
                              directly on its Semgrep ruleset and risk-point aggregation; the V2 scoring engine and
                              governance pipeline are ExtensionShield's own.
                            </p>
                            <div className="credit-links">
                              <a href="https://github.com/barvhaim/ThreatXtension" target="_blank" rel="noopener noreferrer" className="credit-link">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                                View ThreatXtension
                              </a>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <h3>Security Analysis</h3>
                    <h4 className="tech-credit">
                      Based on <a href="https://github.com/barvhaim/ThreatXtension" target="_blank" rel="noopener noreferrer">ThreatXtension</a> (MIT per its README)
                    </h4>
                    <p>Static application security testing (SAST) with custom Semgrep rules detecting malicious patterns, obfuscation, and data exfiltration.</p>
                    
                    <div className="pipeline-features">
                      <div className="feature-tag">Semgrep SAST</div>
                      <div className="feature-tag">37 Custom Rules</div>
                      <div className="feature-tag">Malware Detection</div>
                      <div className="feature-tag">Code Obfuscation</div>
                    </div>
                  </div>
                </div>
                <div className="pipeline-right">
                  <div className="pipeline-dial-wrapper">
                    <DonutScore score={88} band={getBandFromScore(88)} size={240} label="SECURITY" />
                  </div>
                </div>
              </div>
            </div>

            {/* Flow Arrow */}
            <div className="flow-arrow">
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M12 0 L12 40 M12 40 L8 36 M12 40 L16 36" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Pipeline 2: Privacy Analysis */}
            <div className="pipeline-card">
              <div className="pipeline-number">02</div>
              <div className="pipeline-content">
                <div className="pipeline-left">
                  <div className="pipeline-icon privacy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div className="pipeline-details">
                    <h3>Privacy Analysis</h3>
                    <h4 className="tech-credit">Behavioral privacy analysis</h4>
                    <p>Behavioral analysis of data collection, third-party trackers, PII handling, and cross-origin communication patterns.</p>
                    
                    <div className="pipeline-features">
                      <div className="feature-tag">Data Collection</div>
                      <div className="feature-tag">Third-Party Tracking</div>
                      <div className="feature-tag">PII Detection</div>
                      <div className="feature-tag">Storage Audit</div>
                    </div>
                  </div>
                </div>
                <div className="pipeline-right">
                  <div className="pipeline-dial-wrapper">
                    <DonutScore score={72} band={getBandFromScore(72)} size={240} label="PRIVACY" />
                  </div>
                </div>
              </div>
            </div>

            {/* Flow Arrow */}
            <div className="flow-arrow">
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M12 0 L12 40 M12 40 L8 36 M12 40 L16 36" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Pipeline 3: Governance */}
            <div className="pipeline-card">
              <div className="pipeline-number">03</div>
              <div className="pipeline-content">
                <div className="pipeline-left">
                  <div className="pipeline-icon compliance">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="pipeline-details">
                    <h3>Governance</h3>
                    <h4 className="tech-credit">Policy &amp; disclosure signals</h4>
                    <p>
                      Terms-of-service alignment, disclosure and privacy-policy consistency, and claimed-versus-actual behavior. The report surfaces evidence so a reader can see whether the extension does what it says it does.
                    </p>

                    <div className="pipeline-features">
                      <div className="feature-tag">ToS Alignment</div>
                      <div className="feature-tag">Disclosure Consistency</div>
                      <div className="feature-tag">Claimed vs Actual Behavior</div>
                      <div className="feature-tag">Permission Audit</div>
                    </div>
                  </div>
                </div>
                <div className="pipeline-right">
                  <div className="pipeline-dial-wrapper">
                    <DonutScore score={52} band={getBandFromScore(52)} size={240} label="GOVERNANCE" />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Related reads */}
          <section className="methodology-related" aria-label="Related reads">
            <h3>Related</h3>
            <ul>
              <li><Link to="/scan">Scan an extension</Link> — Get a risk score in under a minute</li>
              <li><Link to="/research/case-studies">Browse case studies</Link> — Real-world analysis</li>
              <li><Link to="/compare">Compare Tools</Link> — ExtensionShield vs CRXcavator and others</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
};

export default MethodologyPage;
