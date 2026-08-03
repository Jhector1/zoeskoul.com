"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AssignmentStatus =
    | { phase: "idle" }
    | {
  phase: "in_progress" | "complete";
  pct: number;
  answeredCount: number;
  targetCount: number;
  rightCount: number;
  missedCount: number;
  rightPct: number;
  missedPct: number;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

const RECENT_FETCH_MS = 1200;
const lastFetchAtByKey = new Map<string, number>();

function buildFetchKey(
    sessionId: string,
    subject?: string | null,
    module?: string | null,
) {
  return `${sessionId}::${subject ?? ""}::${module ?? ""}`;
}

export function useAssignmentStatus(args: {
  sessionId: string | null;
  enabled: boolean;
  subject?: string | null;
  module?: string | null;
}) {
  const { sessionId, enabled, subject, module } = args;

  const [status, setStatus] = useState<AssignmentStatus>({ phase: "idle" });

  const mountedRef = useRef(false);
  const paywalledRef = useRef(false);
  const requestSeqRef = useRef(0);

  const sid = useMemo(() => (sessionId ? String(sessionId) : ""), [sessionId]);

  const fetchKey = useMemo(() => {
    if (!sid) return "";
    return buildFetchKey(sid, subject, module);
  }, [sid, subject, module]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(
      async (opts?: { force?: boolean }) => {
        if (!enabled) return;

        if (!sid) {
          if (mountedRef.current) {
            setStatus({ phase: "idle" });
          }
          return;
        }

        if (paywalledRef.current) return;

        const force = opts?.force === true;

        if (!force && fetchKey) {
          const lastAt = lastFetchAtByKey.get(fetchKey) ?? 0;
          const age = Date.now() - lastAt;
          if (age < RECENT_FETCH_MS) return;
        }

        if (fetchKey) {
          lastFetchAtByKey.set(fetchKey, Date.now());
        }

        const reqId = ++requestSeqRef.current;

        try {
          const qs = new URLSearchParams();
          qs.set("sessionId", sid);
          qs.set("statusOnly", "true");

          if (subject) qs.set("subject", subject);
          if (module) qs.set("module", module);

          const r = await fetch(`/api/practice?${qs.toString()}`, {
            cache: "no-store",
          });

          if (!mountedRef.current) return;
          if (reqId !== requestSeqRef.current) return;

          if (r.status === 402) {
            paywalledRef.current = true;
            setStatus({ phase: "idle" });
            return;
          }

          if (!r.ok) return;

          const d = await r.json().catch(() => null);
          if (!mountedRef.current || !d) return;
          if (reqId !== requestSeqRef.current) return;

          // Progress created by older builds may still point at a normal
          // subscriber-practice session. Never present that session as the
          // module assignment; the CTA will replace it through the dedicated
          // assignment start/resume endpoint.
          if (d?.run?.mode !== "assignment") {
            setStatus({ phase: "idle" });
            return;
          }

          const targetCount = Number(d?.targetCount ?? 0);
          const answeredCount = Number(d?.answeredCount ?? 0);

          const rightCountRaw = Number(d?.correctCount ?? d?.correct ?? 0);
          const rightCount = Math.max(0, Math.min(answeredCount, rightCountRaw));
          const missedCount = Math.max(0, answeredCount - rightCount);

          const denom = targetCount > 0 ? targetCount : Math.max(1, answeredCount);
          const rightPct = clamp01(rightCount / denom);
          const missedPct = clamp01(missedCount / denom);
          const pct = targetCount > 0 ? Math.min(1, answeredCount / targetCount) : 0;

          const complete =
              Boolean(d?.complete) ||
              Boolean(d?.sessionComplete) ||
              d?.status === "completed" ||
              (targetCount > 0 && answeredCount >= targetCount);

          setStatus({
            phase: complete ? "complete" : "in_progress",
            pct: complete ? 1 : pct,
            answeredCount,
            targetCount,
            rightCount,
            missedCount,
            rightPct,
            missedPct,
          });
        } catch {
          // ignore transient network errors
        }
      },
      [enabled, sid, subject, module, fetchKey],
  );

  useEffect(() => {
    if (!enabled) return;

    if (!sid) {
      setStatus({ phase: "idle" });
      return;
    }

    paywalledRef.current = false;
    void loadStatus({ force: true });

    const onFocus = () => {
      if (paywalledRef.current) return;
      void loadStatus();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (paywalledRef.current) return;
      void loadStatus();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, sid, loadStatus]);

  const complete = useMemo(() => status.phase === "complete", [status.phase]);
  const pct = useMemo(() => (status.phase === "idle" ? 0 : status.pct), [status]);
  const rightPct = useMemo(
      () => (status.phase === "idle" ? 0 : status.rightPct),
      [status],
  );
  const missedPct = useMemo(
      () => (status.phase === "idle" ? 0 : status.missedPct),
      [status],
  );

  const refresh = useCallback(() => {
    void loadStatus({ force: true });
  }, [loadStatus]);

  return {
    status,
    complete,
    pct,
    rightPct,
    missedPct,
    paywalled: paywalledRef.current,
    refresh,
  };
}