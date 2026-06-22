/**
 * Authentication utility functions
 */

/**
 * Returns true if scanning should require authentication.
 * Skip auth (return false) for: localhost, dev, stage environments.
 * Require auth (return true) only for production.
 */
export function requiresAuthForScan() {
  // Explicit override: skip auth when VITE_REQUIRE_AUTH_FOR_SCAN is false
  if (import.meta.env.VITE_REQUIRE_AUTH_FOR_SCAN === "false") {
    return false;
  }
  // Skip auth on localhost
  if (typeof window !== "undefined") {
    const h = (window.location.hostname || "").toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return false;
    if (h.startsWith("dev.") || h.startsWith("stage.") || h.includes(".dev.") || h.includes(".stage.")) return false;
  }
  // Skip auth in Vite dev mode or when MODE is development/stage
  if (import.meta.env.DEV) return false;
  if (import.meta.env.MODE === "development" || import.meta.env.MODE === "stage") return false;
  // Production: require auth
  return true;
}

/**
 * Checks if a string contains control characters or null bytes
 */
const hasControlChars = (str) => {
  // Check for null byte or control characters (0x00-0x1F, except \t, \n, \r).
  // Matching control characters is the explicit purpose of this guard, so the
  // no-control-regex rule (which flags them as likely-accidental) does not apply.
  // eslint-disable-next-line no-control-regex
  return /[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(str);
};

/**
 * Validates and sanitizes returnTo URL to prevent open redirects and loops
 * @param {string|null} returnTo - The return URL to validate
 * @returns {string} - Validated return URL (defaults to "/" if invalid)
 */
export const validateReturnTo = (returnTo) => {
  if (!returnTo) return "/";
  
  // Trim whitespace
  returnTo = returnTo.trim();
  
  // Reject empty string after trimming
  if (!returnTo) return "/";
  
  // Reject strings containing control characters or null bytes
  if (hasControlChars(returnTo)) {
    // console.warn("Invalid returnTo (contains control characters):", returnTo); // prod: no console
    return "/";
  }
  
  // Normalize backslashes to forward slashes
  returnTo = returnTo.replace(/\\/g, "/");
  
  // Only allow relative paths starting with /
  if (!returnTo.startsWith("/")) {
    // console.warn("Invalid returnTo (not relative):", returnTo); // prod: no console
    return "/";
  }
  
  // Prevent protocol-relative URLs (//evil.com)
  if (returnTo.startsWith("//")) {
    // console.warn("Invalid returnTo (protocol-relative):", returnTo); // prod: no console
    return "/";
  }
  
  // Prevent loops: if returnTo is /auth/callback or starts with it, force home
  if (returnTo === "/auth/callback" || returnTo.startsWith("/auth/callback")) {
    // console.warn("Invalid returnTo (would cause loop):", returnTo); // prod: no console
    return "/";
  }
  
  return returnTo;
};

