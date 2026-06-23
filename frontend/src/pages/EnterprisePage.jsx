import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import realScanService from "../services/realScanService";
import SEOHead from "../components/SEOHead";
import "./EnterprisePage.scss";

/**
 * /enterprise — minimal placeholder.
 *
 * Enterprise capabilities are not shipped yet. This page exists so the route
 * stays a 200 (not a 404) and inbound SEO is preserved. Content is intentionally
 * minimal and factual: no claims about SSO, compliance certifications, SLAs,
 * or centralized management. The form below only collects name + email so we
 * can notify interested teams when team-focused capabilities ship; it posts to
 * the existing /api/enterprise/pilot-request endpoint with an empty interests
 * array (the backend already accepts this shape — no API changes required).
 */
const EnterprisePage = () => {
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_URL || "";

  const [form, setForm] = useState({ name: "", email: "", notes: "" });
  const [submitState, setSubmitState] = useState("idle"); // idle | loading | success | error
  const [submitMessage, setSubmitMessage] = useState("");

  const onChange = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const isValid = Boolean(form.name.trim() && form.email.trim());

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitState === "loading") return;

    setSubmitState("loading");
    setSubmitMessage("");

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        company: null,
        notes: form.notes.trim() || null,
        interests: [],
        custom_extension_notes: null,
      };
      const res = await fetch(`${API_BASE_URL}/api/enterprise/pilot-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...realScanService.getUserHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitState("error");
        setSubmitMessage("Something went wrong. Please try again.");
        return;
      }

      setSubmitState("success");
      setSubmitMessage("Thanks — we'll get in touch when enterprise capabilities are available.");
      setForm({ name: "", email: "", notes: "" });
    } catch (err) {
      setSubmitState("error");
      setSubmitMessage(err?.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <>
      <SEOHead
        title="Enterprise (planned) | ExtensionShield"
        description="ExtensionShield is currently focused on open-source extension analysis. Enterprise capabilities are planned for the future."
        pathname="/enterprise"
        ogType="website"
      />
      <div className="enterprise-page enterprise-page--minimal">
        <div className="enterprise-container">
          <div className="enterprise-header">
            <button className="enterprise-back" onClick={() => navigate(-1)}>
              <span className="arrow">←</span> Back
            </button>

            <h1>Enterprise — planned</h1>
            <p>
              ExtensionShield is currently focused on open-source extension analysis.
              Enterprise capabilities are planned for the future.
            </p>
          </div>

          <div className="enterprise-minimal-body">
            <p>
              Today, the project provides scored pre-install reports for individual
              extensions through the open-source scanner. Team-focused capabilities —
              centralized review, policy management, audit exports, and single
              sign-on — are not available yet.
            </p>

            <h2>Get notified</h2>
            <p>
              If you'd like to be contacted when enterprise capabilities ship, leave
              your details below.
            </p>

            <form className="enterprise-form enterprise-form--minimal" onSubmit={onSubmit}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="enterprise-name">Name</label>
                  <input
                    id="enterprise-name"
                    value={form.name}
                    onChange={onChange("name")}
                    autoComplete="name"
                    aria-required="true"
                  />
                </div>
                <div className="field">
                  <label htmlFor="enterprise-email">Work email</label>
                  <input
                    id="enterprise-email"
                    value={form.email}
                    onChange={onChange("email")}
                    autoComplete="email"
                    inputMode="email"
                    aria-required="true"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="enterprise-notes">Notes (optional)</label>
                  <textarea
                    id="enterprise-notes"
                    value={form.notes}
                    onChange={onChange("notes")}
                    rows={3}
                  />
                </div>
              </div>

              {submitMessage && (
                <div className={`form-status ${submitState}`}>{submitMessage}</div>
              )}

              <button
                type="submit"
                className="enterprise-submit"
                disabled={!isValid || submitState === "loading"}
                title={!isValid ? "Please fill name and work email" : ""}
                aria-busy={submitState === "loading"}
              >
                {submitState === "loading" ? "Submitting..." : "Notify me"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default EnterprisePage;
