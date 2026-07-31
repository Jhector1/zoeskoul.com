"use client";

import { useMemo, useState } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "../practiceType";
import { normalizeAiMath, pickAnswerForAI } from "../lib/aiHelpers";

export type UseConceptExplainResult = {
  canExplain: boolean;
  aiBusy: boolean;
  aiErr: string | null;
  aiText: string | null;
  explainConcept: () => Promise<void>;
};

export function useConceptExplain({
  current,
  exercise,
}: {
  current: QItem | null;
  exercise: Exercise | null;
}): UseConceptExplainResult {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiByKey, setAiByKey] = useState<Record<string, string>>({});

  const key = current?.key ?? null;

  const canExplain = Boolean(key && current?.result?.ok === false);

  const aiText = useMemo(() => {
    if (!key) return null;
    const raw = aiByKey[key];
    return raw ? normalizeAiMath(raw) : null;
  }, [key, aiByKey]);

  async function explainConcept() {
    if (!key || !exercise) return;
    if (aiByKey[key]) return;

    setAiBusy(true);
    setAiErr(null);

    try {
      const r = await fetch("/api/practice/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          key,
          mode: "concept",
          userAnswer:
            current?.result?.ok === false
              ? {
                  kind: exercise.kind,
                  answer: pickAnswerForAI(current, exercise),
                }
              : undefined,
        }),
      });

      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response (status ${r.status}): ${text.slice(0, 180)}`);
      }

      if (!r.ok) throw new Error(data?.message ?? `Explain failed (${r.status})`);

      const explanation = String(data?.explanation ?? "").trim();
      if (!explanation) throw new Error("Empty explanation.");

      setAiByKey((prev) => ({ ...prev, [key]: explanation }));
    } catch (e: any) {
      setAiErr(e?.message ?? "Failed to explain.");
    } finally {
      setAiBusy(false);
    }
  }

  return { canExplain, aiBusy, aiErr, aiText, explainConcept };
}
