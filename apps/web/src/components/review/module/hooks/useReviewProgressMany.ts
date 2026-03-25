import {
  completedTopicKeysFromProgress,
  fetchReviewProgressGET,
} from "@/lib/subjects/progressClient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ModuleProgressLite = {
  moduleCompleted: boolean;
  completedTopicKeys: Set<string>;
};

export function useReviewProgressMany(args: {
  subjectSlug: string;
  locale: string;
  moduleIds: string[];
  enabled?: boolean;
  refreshMs?: number;
}) {
  const { subjectSlug, locale, moduleIds, enabled = true, refreshMs = 0 } =
    args;

  // ✅ stable key based on VALUES, not array identity
  const idsKey = moduleIds.filter(Boolean).join("|");

  // ✅ stable array derived from key
  const stableIds = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // ✅ first-load vs background syncing (prevents flicker)
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [byModuleId, setByModuleId] = useState<
    Record<string, ModuleProgressLite>
  >({});

  // keep last known good so a temporary failure doesn't blank UI
  const lastGoodRef = useRef<Record<string, ModuleProgressLite>>({});

  useEffect(() => {
    if (!enabled) return;
    if (!subjectSlug || !locale) return;

    let alive = true;
    const ctrl = new AbortController();

    const isFirstLoad = Object.keys(lastGoodRef.current).length === 0;

    setError(null);
    if (isFirstLoad) setLoading(true);
    else setSyncing(true);

    (async () => {
      try {
        const settled = await Promise.allSettled(
          stableIds.map(async (moduleId) => {
            const p = await fetchReviewProgressGET({
              subjectSlug,
              moduleId,
              locale,
              signal: ctrl.signal,
            });

            return [
              moduleId,
              {
                moduleCompleted: Boolean(p.moduleCompleted),
                completedTopicKeys: completedTopicKeysFromProgress(p),
              },
            ] as const;
          }),
        );

        if (!alive) return;

        // merge into last-known-good
        const next: Record<string, ModuleProgressLite> = {
          ...lastGoodRef.current,
        };

        let okCount = 0;
        for (const r of settled) {
          if (r.status === "fulfilled") {
            okCount++;
            const [id, v] = r.value;
            next[id] = v;
          }
        }

        lastGoodRef.current = next;
        setByModuleId(next);

        if (stableIds.length > 0 && okCount === 0) {
          setError(
            "Could not sync progress (network/server). Showing last known values.",
          );
        }
      } catch (e: any) {
        if (!alive) return;
        if (e?.name !== "AbortError") {
          setError(e?.message ?? "Could not sync progress.");
        }
      } finally {
        if (!alive) return;
        setLoading(false);
        setSyncing(false);
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [enabled, subjectSlug, locale, idsKey, nonce]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    if (!refreshMs || refreshMs <= 0) return;
    const t = setInterval(() => refresh(), Math.max(2000, refreshMs));
    return () => clearInterval(t);
  }, [enabled, refresh, refreshMs]);

  return { loading, syncing, error, byModuleId, refresh };
}
