import { useEffect } from "react";

// The app is light-only — the dark-mode toggle was removed. This provider simply
// guarantees <html class="light"> (index.css keys ALL styling off `.light`) and
// clears any dark preference persisted by older builds so returning users aren't
// stranded. There is no theme state, toggle, or context value anymore.
function forceLightTheme() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("light");
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
      localStorage.removeItem("theme");
    }
  } catch {
    /* ignore storage access errors (e.g. privacy mode) */
  }
}

// Apply as early as the module loads so `.light` is present before first paint.
forceLightTheme();

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    forceLightTheme();
  }, []);
  return children;
};
