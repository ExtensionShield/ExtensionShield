import { useEffect, useState } from "react";
import { getReviewQueue } from "../services/communityService";

/**
 * useReviewQueue — loads the community review queue from the backend.
 * Returns an empty list (not an error) when the queue is empty or the endpoint
 * is unavailable, so callers can render an honest empty state.
 *
 * @returns {{ items: Array, loading: boolean }}
 */
export default function useReviewQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReviewQueue()
      .then((rows) => {
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}
