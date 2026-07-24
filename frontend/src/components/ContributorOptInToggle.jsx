import React, { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./ContributorOptInToggle.scss";

/**
 * ContributorOptInToggle — lets a signed-in user opt in/out of the community
 * contributor program. Phase A persists the flag to Supabase user_metadata
 * (client-writable, no migration); Phase B moves it to user_profiles.is_contributor.
 *
 * Renders nothing in OSS mode (auth disabled); prompts sign-in when logged out.
 */
export default function ContributorOptInToggle() {
  const { user, isAuthenticated, authEnabled, openSignInModal, refreshAuth } = useAuth();
  const [optIn, setOptIn] = useState(Boolean(user?.isContributor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setOptIn(Boolean(user?.isContributor));
  }, [user?.isContributor]);

  if (!authEnabled) return null;

  if (!isAuthenticated) {
    return (
      <div className="settings-section">
        <div className="section-header">
          <Users />
          <div>
            <div className="section-title">Community Contributor</div>
            <p className="section-description">
              Sign in to join the contributor program — appear on the community
              leaderboard and help review flagged findings.
            </p>
            <button type="button" className="contributor-signin" onClick={openSignInModal}>
              Sign in to continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const toggle = async () => {
    if (saving) return;
    const next = !optIn;
    setOptIn(next);
    setSaving(true);
    setError(null);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        data: { is_contributor: next },
      });
      if (updErr) throw updErr;
      await refreshAuth();
    } catch (e) {
      setOptIn(!next);
      setError(e?.message || "Couldn't save that change. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <Users />
        <div className="contributor-block">
          <div className="contributor-row">
            <div className="contributor-copy">
              <div className="section-title">Community Contributor</div>
              <p className="section-description">
                When on, you appear on the community leaderboard and can review
                flagged findings. Points and verified-review badges roll out with
                our karma-on-verify system.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={optIn}
              aria-label="Community contributor mode"
              className={`contributor-switch ${optIn ? "on" : ""}`}
              onClick={toggle}
              disabled={saving}
            >
              <span className="contributor-switch-knob" />
            </button>
          </div>
          {error && <p className="contributor-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
