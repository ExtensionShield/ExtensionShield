// TEMPORARY — copy + storage key for the site-wide methodology notice modal.
// Centralized here so the text is easy to tweak or remove. Kept in a separate
// module from the component so Fast Refresh stays happy
// (react-refresh/only-export-components).
export const METHODOLOGY_NOTICE = {
  title: "Methodology notice",
  body: "ExtensionShield’s scoring model is being actively calibrated. Use the score as guidance, not a final verdict. Review the evidence below and cross-check important decisions.",
  dismissLabel: "I understand",
};

// Bump the version suffix to re-surface the notice after a copy change.
export const METHODOLOGY_NOTICE_STORAGE_KEY = "es_methodology_notice_dismissed_v1";
