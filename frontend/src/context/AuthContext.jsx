import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import authService, { EMAIL_CONFIRM_REQUIRED_MESSAGE, MAGIC_LINK_SENT_MESSAGE } from "../services/authService";
import { supabase } from "../services/supabaseClient";
import realScanService from "../services/realScanService";
import databaseService from "../services/databaseService";
import { validateReturnTo } from "../utils/authUtils";
import logger from "../utils/logger";
import { AUTH_ENABLED } from "../utils/featureFlags";

const AuthContext = createContext(null);

// Context modules co-locate the Provider and its hook by design; this is the
// canonical React pattern. react-refresh/only-export-components is a Fast-Refresh
// DX heuristic, not a correctness check, so a scoped disable is the right choice.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const noop = () => {};
const asyncNoop = async () => {};

// OSS mode: auth is disabled. Only the sign-in modal state is live so the
// "Sign In" button can still open a modal explaining how to enable auth.
// All hooks run unconditionally — no early returns.
function AuthProviderDisabled({ children }) {
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const openModal = useCallback(() => setIsSignInModalOpen(true), []);
  const closeModal = useCallback(() => setIsSignInModalOpen(false), []);

  const value = {
    user: null,
    session: null,
    isLoading: false,
    isAuthenticated: false,
    accessToken: null,
    getAccessToken: () => null,
    authError: null,
    authSuccessMessage: null,
    isSignInModalOpen,
    signInWithGoogle: asyncNoop,
    signInWithGitHub: asyncNoop,
    signInWithMagicLink: asyncNoop,
    signInWithEmail: asyncNoop,
    signUpWithEmail: asyncNoop,
    signOut: asyncNoop,
    openSignInModal: openModal,
    closeSignInModal: closeModal,
    clearError: noop,
    refreshAuth: asyncNoop,
    authEnabled: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Full Supabase-backed auth provider. All hooks run unconditionally.
function AuthProviderEnabled({ children }) {
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState(null);
  const hasProcessedOAuthCodeRef = useRef(false);

  const toUiUser = useCallback((sbUser) => {
    if (!sbUser) return null;
    const meta = sbUser.user_metadata || {};
    const appMeta = sbUser.app_metadata || {};
    const provider = appMeta.provider || meta.provider || "email";
    const name = meta.full_name || meta.name || sbUser.email || "User";
    const avatar = meta.avatar_url || meta.picture || null;
    return {
      id: sbUser.id,
      email: sbUser.email,
      name,
      avatar,
      provider,
      // Phase-A contributor opt-in lives in Supabase user_metadata (client-
      // writable, zero migration). Phase B moves this to user_profiles.is_contributor.
      isContributor: Boolean(meta.is_contributor),
    };
  }, []);

  // Load session on mount + subscribe to auth changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    let fallbackTimeout = null;

    // Set up auth state change listener
    // This handles session updates from all auth methods (OAuth PKCE, email, etc.)
    let authStateSubscription;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!isMounted) return;
          // Only log meaningful auth changes (skip noisy INITIAL_SESSION when no session)
          if (event !== "INITIAL_SESSION" || nextSession) {
            logger.log("Auth state changed:", event, nextSession ? "has session" : "no session");
          }

          setSession(nextSession || null);
          setUser(toUiUser(nextSession?.user));

          // Update API client access token on session changes
          // This handles both initial sign-in and token refresh (scan + history APIs)
          if (nextSession?.access_token) {
            realScanService.setAccessToken(nextSession.access_token);
            databaseService.setAccessToken(nextSession.access_token);
          } else {
            realScanService.setAccessToken(null);
            databaseService.setAccessToken(null);
          }

          // Close modal on successful sign in
          if (event === 'SIGNED_IN' && nextSession) {
            logger.log("User signed in successfully");
            setIsSignInModalOpen(false);
            setAuthError(null);
            setAuthSuccessMessage(null);
            // Redirect to returnTo when user signed in from modal (e.g. View report flow)
            // Skip when we're on OAuth callback page (it handles redirect itself)
            if (typeof window !== "undefined" && window.location.pathname !== "/auth/callback") {
              const returnTo = sessionStorage.getItem("auth:returnTo");
              if (returnTo) {
                sessionStorage.removeItem("auth:returnTo");
                const validated = validateReturnTo(returnTo);
                if (validated !== "/") {
                  window.location.href = validated;
                }
              }
            }
          }

          // Handle token refresh - update API client
          if (event === 'TOKEN_REFRESHED' && nextSession) {
            logger.log("Token refreshed, updating API client");
            realScanService.setAccessToken(nextSession.access_token);
            databaseService.setAccessToken(nextSession.access_token);
          }

          // Clear error on sign out
          if (event === 'SIGNED_OUT') {
            setAuthError(null);
            setAuthSuccessMessage(null);
            realScanService.setAccessToken(null);
            databaseService.setAccessToken(null);
          }
        });
        authStateSubscription = data;
      }
    } catch {
      // Auth state change subscription failed; continue without it.
    }

    // Check for auth errors in URL params (from OAuth callback failures)
    const urlParams = new URLSearchParams(window.location.search);
    const authErrorParam = urlParams.get('authError');
    if (authErrorParam) {
      setAuthError(decodeURIComponent(authErrorParam));
      // Clean up URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const buildCleanReturnTo = () => {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("code");
      currentUrl.searchParams.delete("error");
      currentUrl.searchParams.delete("error_description");
      currentUrl.searchParams.delete("state");
      const search = currentUrl.searchParams.toString();
      return `${currentUrl.pathname}${search ? `?${search}` : ""}`;
    };

    const getSafeReturnTo = () => {
      const storedReturnTo = sessionStorage.getItem("auth:returnTo");
      sessionStorage.removeItem("auth:returnTo");
      return validateReturnTo(storedReturnTo || buildCleanReturnTo());
    };

    const redirectToReturnTo = (returnTo, errorMessage) => {
      const targetUrl = new URL(returnTo, window.location.origin);
      if (errorMessage) {
        targetUrl.searchParams.set("authError", errorMessage);
      }
      window.location.replace(`${targetUrl.pathname}${targetUrl.search}`);
    };

    const handleOAuthCodeFallback = async () => {
      const codeParam = urlParams.get("code");
      const providerError = urlParams.get("error");
      const providerErrorDescription = urlParams.get("error_description");

      if (window.location.pathname === "/auth/callback") {
        return;
      }

      if ((!codeParam && !providerError) || hasProcessedOAuthCodeRef.current) {
        return;
      }

      hasProcessedOAuthCodeRef.current = true;
      const returnTo = getSafeReturnTo();

      if (providerError) {
        setAuthError(providerErrorDescription || providerError || "Authentication failed");
        redirectToReturnTo(returnTo, providerErrorDescription || providerError || "auth_failed");
        return;
      }

      if (!codeParam) {
        setAuthError("Missing authorization code. Please try signing in again.");
        redirectToReturnTo(returnTo, "missing_code");
        return;
      }

      try {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeParam);
        if (exchangeError) {
          setAuthError(exchangeError.message || "Authentication failed");
          redirectToReturnTo(returnTo, exchangeError.message || "auth_failed");
          return;
        }

        // Success: redirect to returnTo without auth params
        redirectToReturnTo(returnTo);
      } catch (error) {
        setAuthError(error.message || "Authentication failed");
        redirectToReturnTo(returnTo, error.message || "auth_failed");
      }
    };

    handleOAuthCodeFallback();

    const load = async () => {
      try {
        // Check if Supabase is configured
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          logger.warn("Supabase not configured - running in anonymous mode");
          if (isMounted) setIsLoading(false);
          return;
        }

        // Get current session with timeout to prevent hanging
        const sessionPromise = supabase.auth.getSession();
        let timeoutFired = false;

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timeoutFired = true;
            reject(new Error("Session check timeout - taking too long"));
          }, 5000);
        });

        let sessionResult;
        try {
          sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
        } catch (error) {
          // If timeout fired, we'll handle it gracefully
          if (timeoutFired) {
            logger.warn("Session check timed out, continuing without session");
            sessionResult = { data: { session: null }, error: null };
          } else {
            throw error;
          }
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }

        const { data, error: sessionError } = sessionResult;

        if (sessionError) throw sessionError;
        if (!isMounted) return;

        setSession(data.session || null);
        setUser(toUiUser(data.session?.user));
      } catch {
        // Auth session load failed; continue without auth and clear stuck state.
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (isMounted) setIsLoading(false);
      }
    };

    load();

    // Fallback timeout - ensure isLoading is always set to false (avoid infinite loading)
    fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        logger.warn("Auth initialization taking too long, forcing completion");
        setIsLoading(false);
      }
    }, 6000);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(fallbackTimeout);
      try {
        if (authStateSubscription?.subscription?.unsubscribe) {
          authStateSubscription.subscription.unsubscribe();
        } else if (authStateSubscription?.data?.subscription?.unsubscribe) {
          authStateSubscription.data.subscription.unsubscribe();
        } else if (typeof authStateSubscription?.unsubscribe === "function") {
          authStateSubscription.unsubscribe();
        }
      } catch {
        // ignore cleanup errors
      }
    };
  }, [toUiUser]);

  // Keep API requests in sync with current auth session
  // Note: This is a fallback - the main sync happens in onAuthStateChange
  // to catch TOKEN_REFRESHED events
  useEffect(() => {
    const token = session?.access_token || null;
    realScanService.setAccessToken(token);
    databaseService.setAccessToken(token);
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      await authService.signInWithGoogle();
      // OAuth redirects immediately, so we don't close modal or set loading here
      // The redirect will happen and we'll process the callback on return
      // Modal will be closed and loading set to false in the OAuth callback handler
    } catch (error) {
      // Only handle errors if OAuth didn't redirect (shouldn't happen normally)
      setAuthError(error.message);
      setIsLoading(false);
      throw error;
    }
    // Note: No finally block - OAuth redirects immediately so this code won't execute
  }, []);

  const signInWithGitHub = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      await authService.signInWithGitHub();
      // OAuth redirects immediately, so we don't close modal or set loading here
      // The redirect will happen and we'll process the callback on return
      // Modal will be closed and loading set to false in the OAuth callback handler
    } catch (error) {
      // Only handle errors if OAuth didn't redirect (shouldn't happen normally)
      setAuthError(error.message);
      setIsLoading(false);
      throw error;
    }
    // Note: No finally block - OAuth redirects immediately so this code won't execute
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const sbUser = await authService.signInWithEmail(email, password);
      // Refresh session to ensure it's up to date
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        setSession(sessionData.session);
        setUser(toUiUser(sessionData.session.user));
      } else {
        setUser(toUiUser(sbUser));
      }
      setIsSignInModalOpen(false);
      return sbUser;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const signInWithMagicLink = useCallback(async (email) => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsLoading(true);
    try {
      await authService.signInWithMagicLink(email);
      setAuthSuccessMessage(MAGIC_LINK_SENT_MESSAGE);
      return null;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUpWithEmail = useCallback(async (email, password, name) => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsLoading(true);
    try {
      const result = await authService.signUpWithEmail(email, password, name);
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        setSession(sessionData.session);
        setUser(toUiUser(sessionData.session.user));
        setIsSignInModalOpen(false);
        return result.user;
      }
      if (result.needsEmailConfirmation) {
        setAuthSuccessMessage(EMAIL_CONFIRM_REQUIRED_MESSAGE);
        return result.user;
      }
      setUser(toUiUser(result.user));
      return result.user;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
      setSession(null);
      setUser(null);
    } catch {
      // Sign out failed; state is cleared in finally regardless.
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openSignInModal = useCallback(() => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsSignInModalOpen(true);
  }, []);

  const closeSignInModal = useCallback(() => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsSignInModalOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setAuthError(null);
    setAuthSuccessMessage(null);
  }, []);

  // Manual refresh function to reset auth state if stuck
  const refreshAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setSession(null);
        setUser(null);
      } else {
        setSession(data.session || null);
        setUser(toUiUser(data.session?.user));
      }
    } catch {
      // Auth refresh failed; clear session/user.
      setSession(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!session?.user,
    accessToken: session?.access_token || null,
    getAccessToken: () => session?.access_token || null,
    authError,
    authSuccessMessage,
    isSignInModalOpen,
    signInWithGoogle,
    signInWithGitHub,
    signInWithMagicLink,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    openSignInModal,
    closeSignInModal,
    clearError,
    refreshAuth,
    authEnabled: true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Pick the provider variant once, based on the build-time feature flag. The
// wrapper itself calls no hooks, so each inner provider's hooks always run in a
// stable order (Rules of Hooks). AUTH_ENABLED is constant for the app lifetime,
// so the chosen branch never changes across renders.
export const AuthProvider = ({ children }) =>
  AUTH_ENABLED ? (
    <AuthProviderEnabled>{children}</AuthProviderEnabled>
  ) : (
    <AuthProviderDisabled>{children}</AuthProviderDisabled>
  );

export default AuthContext;
