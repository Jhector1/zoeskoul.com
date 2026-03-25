// src/components/review/module/hooks/useAssignmentStatus.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type AssignmentStatus =
    | { phase: "idle" }
    | {
  phase: "in_progress" | "complete";
  pct: number; // answered / target
  answeredCount: number;
  targetCount: number;

  // ✅ NEW
  rightCount: number;
  missedCount: number;
  rightPct: number;  // right / target
  missedPct: number; // missed / target
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function useAssignmentStatus(args: {
  sessionId: string | null;
  enabled: boolean;
  subject?: string | null;
  module?: string | null;
}) {
  const { sessionId, enabled, subject, module } = args;

  const [status, setStatus] = useState<AssignmentStatus>({ phase: "idle" });

  const phaseRef = useRef<AssignmentStatus["phase"]>("idle");
  useEffect(() => {
    phaseRef.current = status.phase;
  }, [status.phase]);

  const paywalledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const sid = sessionId ? String(sessionId) : "";
    if (!sid) {
      setStatus({ phase: "idle" });
      return;
    }

    paywalledRef.current = false;
    let alive = true;

    async function loadStatus() {
      if (!alive) return;
      if (paywalledRef.current) return;

      try {
        const qs = new URLSearchParams();
        qs.set("sessionId", sid);
        qs.set("statusOnly", "true");
        // ✅ IMPORTANT: do NOT includeHistory here (keeps polling light)
        // qs.set("includeHistory", "true");

        if (subject) qs.set("subject", subject);
        if (module) qs.set("module", module);

        const r = await fetch(`/api/practice?${qs.toString()}`, { cache: "no-store" });

        if (r.status === 402) {
          paywalledRef.current = true;
          setStatus({ phase: "idle" });
          return;
        }

        if (!r.ok) return;

        const d = await r.json().catch(() => null);
        if (!alive || !d) return;

        const targetCount = Number(d?.targetCount ?? 0);
        const answeredCount = Number(d?.answeredCount ?? 0);

        // ✅ right/missed from server counters
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
        // ignore
      }
    }

    loadStatus();

    const onFocus = () => {
      if (paywalledRef.current) return;
      loadStatus();
    };
    window.addEventListener("focus", onFocus);

    const t = setInterval(() => {
      if (!alive) return;
      if (paywalledRef.current) return;
      if (phaseRef.current === "complete") return;
      loadStatus();
    }, 4000);

    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, sessionId, subject, module]);

  const complete = useMemo(() => status.phase === "complete", [status.phase]);

  const pct = useMemo(() => (status.phase === "idle" ? 0 : status.pct), [status]);
  const rightPct = useMemo(() => (status.phase === "idle" ? 0 : status.rightPct), [status]);
  const missedPct = useMemo(() => (status.phase === "idle" ? 0 : status.missedPct), [status]);

  return { status, complete, pct, rightPct, missedPct, paywalled: paywalledRef.current };
}