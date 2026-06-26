import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

const ThemeContext = createContext();

// Context modules co-locate the Provider and its hook by design; this is the
// canonical React pattern. The rule below is a Fast-Refresh DX heuristic, not a
// correctness check, so a scoped disable is the appropriate, low-churn choice.
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// Routes that should always use dark mode (none - all pages support light/dark)
const FORCE_DARK_ROUTES = [];

export const ThemeProvider = ({ children }) => {
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    // Dark mode toggle was removed; clear any persisted dark preference so returning
    // users aren't stuck in dark mode with no way to escape.
    if (localStorage.getItem("theme") === "dark") {
      localStorage.removeItem("theme");
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("light");
    }
    return "light";
  });

  // Determine effective theme based on route
  const effectiveTheme = useMemo(() => {
    // Force dark mode on specific routes (but not homepage)
    if (location.pathname !== "/" && FORCE_DARK_ROUTES.some(route => location.pathname.startsWith(route))) {
      return "dark";
    }
    return theme;
  }, [theme, location.pathname]);

  useEffect(() => {
    // Apply theme via html class only; CSS (.light in index.css) handles backgrounds
    if (effectiveTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }

    // Persist user choice (not effective theme) to localStorage
    if (effectiveTheme === theme) {
      localStorage.setItem("theme", theme);
    }
  }, [effectiveTheme, theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme, setTheme, actualTheme: theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

