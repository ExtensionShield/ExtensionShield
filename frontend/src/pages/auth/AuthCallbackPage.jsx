import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import { validateReturnTo } from "../../utils/authUtils";
import SEOHead from "../../components/SEOHead";
import ShieldLogo from "../../components/ShieldLogo";
import "./AuthCallbackPage.scss";

/**
 * Auth Callback Page
 *
 * With detectSessionInUrl: true, Supabase automatically exchanges the OAuth code
 * (or reads hash from magic link) when this page loads. We must NOT call
 * exchangeCodeForSession() here—that causes a second exchange, consumes the
 * verifier, and triggers "PKCE code verifier not found" (you end up logged in
 * but with authError in the URL).
 *
 * This page only:
 * 1. Handles error param from OAuth provider
 * 2. Waits for SIGNED_IN / session from Supabase's automatic handling
 * 3. Redirects to stored return URL (or home) with a clean URL
 */
const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("processing"); // processing, success, error

  const redirectTimeoutRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const authStateListenerRef = useRef(null);
  const redirectDoneRef = useRef(false);
  const returnToRef = useRef("/");

  useEffect(() => {
    const returnTo = validateReturnTo(sessionStorage.getItem("auth:returnTo") || "/");
    returnToRef.current = returnTo;

    const goToReturnWithError = (errorMessage) => {
      if (redirectDoneRef.current) return;
      redirectDoneRef.current = true;
      sessionStorage.removeItem("auth:returnTo");
      navigate(`${returnTo}?authError=${encodeURIComponent(errorMessage || "auth_failed")}`, { replace: true });
    };

    const goToReturnSuccess = () => {
      if (redirectDoneRef.current) return;
      redirectDoneRef.current = true;
      sessionStorage.removeItem("auth:returnTo");
      navigate(returnTo, { replace: true });
    };

    // 1) OAuth provider returned an error
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (errorParam) {
      setError(errorDescription || errorParam || "Authentication failed");
      setStatus("error");
      redirectTimeoutRef.current = setTimeout(
        () => goToReturnWithError(errorDescription || errorParam),
        2000
      );
      return () => {
        if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      };
    }

    // 2) No code and no hash (e.g. user opened /auth/callback by hand) → redirect without error
    const code = searchParams.get("code");
    const hasHash = typeof window !== "undefined" && window.location.hash?.length > 0;
    if (!code && !hasHash) {
      redirectTimeoutRef.current = setTimeout(goToReturnSuccess, 500);
      return () => {
        if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      };
    }

    // 3) We have code (or hash for magic link). Supabase auto-exchanges; we wait for session.
    setStatus("processing");

    const onAuthState = (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        setStatus("success");
        redirectTimeoutRef.current = setTimeout(goToReturnSuccess, 400);
      }
    };

    const { data: authStateData } = supabase.auth.onAuthStateChange(onAuthState);
    authStateListenerRef.current = authStateData;

    // In case session was already set before we subscribed
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session && !redirectDoneRef.current) {
        setStatus("success");
        redirectTimeoutRef.current = setTimeout(goToReturnSuccess, 400);
      }
    });

    // Timeout: if no session after 10s, show error and redirect (e.g. auto-exchange failed)
    fallbackTimeoutRef.current = setTimeout(() => {
      if (redirectDoneRef.current) return;
      setError(
        "Sign-in couldn't be completed. The sign-in link may have expired or was opened in a different browser. Please try again."
      );
      setStatus("error");
      redirectTimeoutRef.current = setTimeout(
        () => goToReturnWithError("Sign-in timed out. Please try again."),
        2000
      );
    }, 10000);

    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      if (authStateListenerRef.current?.subscription?.unsubscribe) {
        authStateListenerRef.current.subscription.unsubscribe();
      }
    };
  }, [searchParams, navigate]);

  return (
    <>
      <SEOHead
        title="Sign-in callback"
        description="Completing sign-in."
        pathname="/auth/callback"
        noindex
      />
      <div className="auth-callback-page">
        {status === "success" ? (
          /* Success state — minimal centered composition on the existing
             ExtensionShield off-white/grid background. No dark card.
             The redirect timing (400ms after setStatus('success')) is owned
             by the parent useEffect; nothing here delays or alters it. */
          <div className="auth-callback-success-state" role="status" aria-live="polite">
            <div className="auth-callback-success-shield" aria-hidden="true">
              <ShieldLogo size={36} />
            </div>
            <div className="auth-callback-success-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="8 12.5 11 15.5 16.5 9.5" />
              </svg>
            </div>
            <h1 className="auth-callback-success-heading">Signed in</h1>
            <p className="auth-callback-success-status">Redirecting…</p>
          </div>
        ) : (
          <div className="auth-callback-container">
            <div className="auth-callback-content">
              <ShieldLogo size={64} />
              <h1 className="auth-callback-title">ExtensionShield</h1>

              {status === "processing" && (
                <>
                  <div className="auth-callback-spinner">
                    <div className="spinner-ring"></div>
                  </div>
                  <p className="auth-callback-message">Signing you in...</p>
                </>
              )}

              {status === "error" && (
                <>
                  <div className="auth-callback-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="auth-callback-message error">{error || "Authentication failed"}</p>
                  <p className="auth-callback-submessage">Redirecting shortly, or click below to go now.</p>
                  <button
                    type="button"
                    className="auth-callback-try-again"
                    onClick={() => {
                      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
                      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
                      redirectDoneRef.current = true;
                      sessionStorage.removeItem("auth:returnTo");
                      const target = returnToRef.current || validateReturnTo(sessionStorage.getItem("auth:returnTo")) || "/";
                      navigate(target, { replace: true });
                    }}
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AuthCallbackPage;

