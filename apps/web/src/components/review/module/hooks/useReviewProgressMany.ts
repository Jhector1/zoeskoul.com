import {
  completedTopicKeysFromProgress,
  emptyReviewProgress,
} from "@zoeskoul/learning-client/legacy-compatible/review/progressClient";
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

  const idsKey = moduleIds.filter(Boolean).join("|");
  const stableIds = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [byModuleId, setByModuleId] = useState<Record<string, ModuleProgressLite>>({});
  const lastGoodRef = useRef<Record<string, ModuleProgressLite>>({});

  useEffect(() => {
    if (!enabled || !subjectSlug || !locale) return;

    let alive = true;
    const ctrl = new AbortController();
    const isFirstLoad = Object.keys(lastGoodRef.current).length === 0;

    setError(null);
    if (isFirstLoad) setLoading(true);
    else setSyncing(true);

    (async () => {
      try {
        const search = new URLSearchParams({
          subjectSlug,
          locale,
          moduleSlugs: stableIds.join(","),
        });
        const response = await fetch(`/api/review/progress-many?${search.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });

        if (!response.ok) {
          throw new Error(`Progress sync failed: ${response.status}`);
        }

        const data = await response.json().catch(() => null);
        const rawByModule =
          data && typeof data === "object" && data.progressByModuleId
            ? (data.progressByModuleId as Record<string, any>)
            : {};

        if (!alive) return;

        const next: Record<string, ModuleProgressLite> = {};
        for (const moduleSlug of stableIds) {
          const progress = rawByModule[moduleSlug] ?? emptyReviewProgress();
          next[moduleSlug] = {
            moduleCompleted: Boolean(progress.moduleCompleted),
            completedTopicKeys: completedTopicKeysFromProgress(progress),
          };
        }

        lastGoodRef.current = next;
        setByModuleId(next);
      } catch (e: any) {
        if (!alive || e?.name === "AbortError") return;
        setError(e?.message ?? "Could not sync progress.");
        setByModuleId(lastGoodRef.current);
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
    if (!enabled || !refreshMs || refreshMs <= 0) return;
    const timer = setInterval(() => refresh(), Math.max(2000, refreshMs));
    return () => clearInterval(timer);
  }, [enabled, refresh, refreshMs]);

  return { loading, syncing, error, byModuleId, refresh };
}
