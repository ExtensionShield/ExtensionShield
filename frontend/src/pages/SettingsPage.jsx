import React, { useState, useEffect } from "react";
import { 
  Settings, 
  Shield, 
  Save, 
  User,
  Info
} from "lucide-react";
import SEOHead from "../components/SEOHead";
import { Button } from "../components/ui/button";
import ContributorOptInToggle from "../components/ContributorOptInToggle";
import "./SettingsPage.scss";

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    securityEngine: "standard", // standard, aggressive
    notifications: true,
  });
  const [saved, setSaved] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const stored = localStorage.getItem("threat_settings");
    if (stored) {
      setSettings(JSON.parse(stored));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("threat_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <SEOHead
        title="Settings"
        description="Account and scanner settings."
        pathname="/settings"
        noindex
      />
      <div className="page-container settings-page">
      <div className="page-header">
        <h1 className="page-title">
          <Settings />
          Settings
        </h1>
        <p className="page-subtitle">
          Configure Extension Compliance Scanner system settings and preferences
        </p>
      </div>

      {/* Beta Launch Notice */}
      <div className="beta-notice">
        <Info />
        <div>
          <h3>Beta Launch</h3>
          <p>
            ExtensionShield is currently in beta. Some features may be limited or subject to change. 
            We appreciate your feedback as we continue to improve the platform.
          </p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <h2>
            <Settings />
            System Configuration
          </h2>
          <Button onClick={handleSave} className="gap-2">
            {saved ? <span className="text-green-400">Saved!</span> : <><Save className="w-4 h-4" /> Save Changes</>}
          </Button>
        </div>

        <div>
          {/* Security Engine Section */}
          <div className="settings-section">
            <div className="section-header">
              <Shield />
              <div>
                <div className="section-title">Security Engine Mode</div>
                <p className="section-description">
                  Set the sensitivity of the security analysis engine.
                </p>

                <div className="security-options">
                  <label
                    className={`security-option ${
                      settings.securityEngine === "standard" ? "active" : ""
                    }`}
                  >
                    <div className="option-label">
                      <input
                        type="radio"
                        name="engine"
                        checked={settings.securityEngine === "standard"}
                        onChange={() => handleChange("securityEngine", "standard")}
                      />
                      <span>Standard</span>
                    </div>
                    <p className="option-description">
                      Balanced checks for common vulnerabilities and known threats.
                    </p>
                  </label>

                  <label
                    className={`security-option ${
                      settings.securityEngine === "aggressive" ? "active-aggressive" : ""
                    }`}
                  >
                    <div className="option-label">
                      <input
                        type="radio"
                        name="engine"
                        checked={settings.securityEngine === "aggressive"}
                        onChange={() => handleChange("securityEngine", "aggressive")}
                      />
                      <span style={{ color: settings.securityEngine === "aggressive" ? "#8b5cf6" : "inherit" }}>
                        Aggressive
                      </span>
                    </div>
                    <p className="option-description">
                      Deep heuristic analysis. May produce more false positives.
                    </p>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Account Section */}
          <div className="settings-section">
            <div className="section-header">
              <User />
              <div>
                <div className="section-title">Account</div>
                <p className="section-description">
                  Manage your account settings and preferences.
                </p>
                
                <div className="account-info">
                  <div className="account-row">
                    <span className="label">Account Status</span>
                    <span className="value active">Active</span>
                  </div>
                  <div className="account-row">
                    <span className="label">Plan</span>
                    <span className="value">Free (Beta)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Community Contributor Section */}
          <ContributorOptInToggle />
        </div>
      </div>
    </div>
    </>
  );
};

export default SettingsPage;
