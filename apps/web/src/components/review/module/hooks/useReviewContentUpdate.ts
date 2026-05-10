"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewContentVersion } from "@/lib/review/contentVersionTypes";

export function useReviewContentUpdate(args: {
    loadedContentVersion?: ReviewContentVersion | null;
    intervalMs?: number;
}) {
    const { loadedContentVersion, intervalMs = 60_000 } = args;

    const [latestContentVersion, setLatestContentVersion] =
        useState<ReviewContentVersion | null>(null);

    const [updateAvailable, setUpdateAvailable] = useState(false);
    const checkingRef = useRef(false);
    const updateAvailableRef = useRef(false);

    useEffect(() => {
        const maybeSubjectSlug = loadedContentVersion?.subjectSlug;
        const maybeModuleSlug = loadedContentVersion?.moduleSlug;
        const maybeLoadedReleaseId = loadedContentVersion?.contentReleaseId;

        if (!maybeSubjectSlug || !maybeModuleSlug || !maybeLoadedReleaseId) {
            return;
        }

        const subjectSlug: string = maybeSubjectSlug;
        const moduleSlug: string = maybeModuleSlug;
        const loadedReleaseId: string = maybeLoadedReleaseId;

        let cancelled = false;

        async function check() {
            if (checkingRef.current) return;
            if (updateAvailableRef.current) return;

            checkingRef.current = true;

            try {
                const url = new URL(
                    "/api/review/content-version",
                    window.location.origin,
                );

                url.searchParams.set("subjectSlug", subjectSlug);
                url.searchParams.set("moduleSlug", moduleSlug);

                const res = await fetch(url.toString(), {
                    cache: "no-store",
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (!res.ok) return;

                const data = await res.json();
                const latest = data?.contentVersion as ReviewContentVersion | undefined;

                if (!latest?.contentReleaseId) return;

                const changed = latest.contentReleaseId !== loadedReleaseId;

                if (!cancelled && changed) {
                    updateAvailableRef.current = true;
                    setLatestContentVersion(latest);
                    setUpdateAvailable(true);
                }
            } catch {
                // Do not interrupt the learner because of network errors.
            } finally {
                checkingRef.current = false;
            }
        }

        check();

        const timer = window.setInterval(check, intervalMs);

        const onFocus = () => check();

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                check();
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [
        loadedContentVersion?.subjectSlug,
        loadedContentVersion?.moduleSlug,
        loadedContentVersion?.contentReleaseId,
        intervalMs,
    ]);

    return {
        updateAvailable,
        latestContentVersion,
    };
}