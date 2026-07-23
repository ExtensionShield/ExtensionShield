import { useEffect, useState } from "react";

/**
 * useGitHubContributors — fetch a repo's contributors from the public GitHub API,
 * with localStorage caching and graceful fallback.
 *
 * Bot accounts (dependabot, github-actions, etc.) and any logins in `exclude`
 * (case-insensitive) are filtered out before the top-`limit` cut, so excluding a
 * maintainer still yields a full list. On any failure (offline, rate limited,
 * private repo) the hook resolves to the last cached list, or an empty array —
 * callers should render a sensible fallback when `contributors` is empty.
 *
 * @param {string}   repo    - "owner/name", e.g. "ExtensionShield/ExtensionShield"
 * @param {number}   limit   - max human contributors to return (default 12)
 * @param {string[]} exclude - logins to omit (e.g. maintainer accounts)
 * @returns {{ contributors: Array<{id:number, login:string, avatar:string|null, profileUrl:string|null, contributions:number}>, loading: boolean }}
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// GitHub returns contributors already sorted by contributions desc. We drop bots
// and excluded logins, then keep the top `limit` humans.
function normalize(raw, limit, excludeSet) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c) =>
        c &&
        c.type === "User" &&
        !/\[bot\]$/i.test(c.login || "") &&
        !excludeSet.has(String(c.login || "").toLowerCase())
    )
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      login: c.login,
      avatar: c.avatar_url || null,
      profileUrl: c.html_url || null,
      contributions: Number.isFinite(c.contributions) ? c.contributions : 0,
    }));
}

export default function useGitHubContributors(repo, limit = 12, exclude = []) {
  // Stable string key for the exclude list so the effect / cache key don't churn
  // when callers pass a fresh array literal each render.
  const excludeKey = exclude.map((s) => String(s).toLowerCase()).sort().join(",");
  const cacheKey = `es:gh-contributors:${repo}:${limit}:${excludeKey}`;

  const [contributors, setContributors] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.value) ? parsed.value : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(contributors.length === 0);

  useEffect(() => {
    let cancelled = false;
    const excludeSet = new Set(excludeKey ? excludeKey.split(",") : []);

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
      Array.isArray(cached.value) &&
      Number.isFinite(cached.ts) &&
      Date.now() - cached.ts < CACHE_TTL_MS;

    if (isFresh) {
      setContributors(cached.value);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`https://api.github.com/repos/${repo}/contributors?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (cancelled) return;
        const value = normalize(data, limit, excludeSet);
        setContributors(value);
        try {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({ value, ts: Date.now() })
          );
        } catch {
          /* storage full / unavailable — ignore */
        }
      })
      .catch(() => {
        // Keep the last cached list (already in state); just stop loading.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [repo, limit, excludeKey, cacheKey]);

  return { contributors, loading };
}
