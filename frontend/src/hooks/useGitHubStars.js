import { useEffect, useState } from "react";

/**
 * useGitHubStars — fetch a repo's stargazer count from the public GitHub API,
 * with localStorage caching and graceful fallback.
 *
 * The count is cached for CACHE_TTL_MS so we don't hit the unauthenticated
 * GitHub rate limit on every page load. On any failure (offline, rate limited,
 * blocked) the hook resolves to the last cached value, or null — callers should
 * render a sensible fallback when `stars` is null.
 *
 * @param {string} repo - "owner/name", e.g. "ExtensionShield/ExtensionShield"
 * @returns {{ stars: number|null, loading: boolean }}
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export default function useGitHubStars(repo) {
  const cacheKey = `es:gh-stars:${repo}`;

  const [stars, setStars] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Number.isFinite(parsed?.value) ? parsed.value : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(stars === null);

  useEffect(() => {
    let cancelled = false;

    const readCache = () => {
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const cached = readCache();
    const isFresh =
      cached &&
      Number.isFinite(cached.value) &&
      Number.isFinite(cached.ts) &&
      Date.now() - cached.ts < CACHE_TTL_MS;

    if (isFresh) {
      setStars(cached.value);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (cancelled) return;
        const value = Number(data?.stargazers_count);
        if (Number.isFinite(value)) {
          setStars(value);
          try {
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify({ value, ts: Date.now() })
            );
          } catch {
            /* storage full / unavailable — ignore */
          }
        }
      })
      .catch(() => {
        // Keep the last cached value (already in state); just stop loading.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [repo, cacheKey]);

  return { stars, loading };
}

/**
 * Format a star count compactly: 1234 -> "1.2k", 980 -> "980".
 */
export function formatStars(n) {
  if (!Number.isFinite(n)) return null;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}
