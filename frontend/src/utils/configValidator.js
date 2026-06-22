/**
 * Runtime Configuration Validator
 * 
 * Validates required environment variables and runtime configuration
 * on app boot. Logs warnings for missing or invalid config.
 */

const ALLOWED_ORIGINS = [
  'https://extensionshield.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8007',
];

/**
 * Validates Supabase configuration
 */
export const validateSupabaseConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isDebug = import.meta.env.VITE_DEBUG_AUTH === "true";

  const errors = [];
  const warnings = [];

  if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    errors.push("VITE_SUPABASE_URL is missing or invalid");
  }

  if (!supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
    errors.push("VITE_SUPABASE_ANON_KEY is missing or invalid");
  }

  if (errors.length > 0) {
    // console.error("❌ Supabase Configuration Errors:", errors); // prod: no console
    return { valid: false, errors, warnings };
  }

  if (isDebug) {
    warnings.push("VITE_DEBUG_AUTH is enabled - diagnostics page is accessible");
    
    // Warn in production
    if (window.location.origin.includes("extensionshield.com")) {
      // console.warn("⚠️ WARNING: Debug mode is enabled in production!"); // prod: no console
    }
  }

  return { valid: true, errors: [], warnings };
};

/**
 * Validates origin is in allowed list
 */
export const validateOrigin = () => {
  const origin = window.location.origin;
  const isDebug = import.meta.env.VITE_DEBUG_AUTH === "true";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  if (!isAllowed && isDebug) {
    // console.warn(
    //   `⚠️ Origin ${origin} is not in the allowed list.`,
    //   "This may indicate a misconfiguration."
    // ); // prod: no console
    // console.warn("Allowed origins:", ALLOWED_ORIGINS); // prod: no console
  }

  return isAllowed;
};

/**
 * Runs all validation checks
 */
export const validateConfig = () => {
  const supabaseCheck = validateSupabaseConfig();

  if (!supabaseCheck.valid) {
    // console.error("Configuration validation failed. Authentication may not work."); // prod: no console
    return false;
  }

  return true;
};

/**
 * Initialize config validation on app boot
 * Call this in main.jsx or App.jsx
 */
export const initConfigValidation = () => {
  if (typeof window === "undefined") return;

  // Run validation
  const isValid = validateConfig();

  if (isValid) {
    // console.log("✅ Configuration validated successfully"); // prod: no console
  }

  return isValid;
};

