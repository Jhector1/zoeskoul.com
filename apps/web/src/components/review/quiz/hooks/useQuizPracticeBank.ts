"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import type { VectorPadState } from "@/components/vectorpad/types";
import { defaultVectorPadState } from "@/components/vectorpad/defaultState";
import type { SavedQuizState } from "@/lib/review/progressTypes";
import type { QItem } from "@/lib/practice/uiTypes";
import type { PracticeItemState } from "@/lib/practice/runtime";
import {
  coerceMaxAttempts,
  extractCodeLike,
  fetchResolvedPracticeItem,
  revealPracticeItem,
  submitPracticeItem,
} from "@/lib/practice/runtime";
import { cloneVec } from "@/lib/practice/uiHelpers";
import { emitSfx } from "@/lib/sfx/bus";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

export { isEmptyPracticeAnswer } from "@/lib/practice/runtime";
export type PracticeState = PracticeItemState;

export function useQuizPracticeBank(args: {
  questions: ReviewQuestion[];
  spec: ReviewQuizSpec;
  unlimitedAttempts: boolean;
  initialState: SavedQuizState | null;
  resetKey: string;
  isCompleted: boolean;
  locked: boolean;
}) {
  const {
    questions,
    spec,
    unlimitedAttempts,
    initialState,
    resetKey,
    isCompleted,
    locked,
  } = args;

  const specMaxAttempts = (spec as any).maxAttempts;

  const tt = useTaggedT();
  const rawKeyRef = useRef<(key: string) => string>((key) => key);
  const resolveTextRef = useRef<(value: string) => string>((value) => value);

  rawKeyRef.current = (key: string) => tt.raw(key, key);
  resolveTextRef.current = (value: string) => tt.resolve(value, value);

  const [practice, setPractice] = useState<Record<string, PracticeState>>({});
  const practiceRef = useRef(practice);

  useEffect(() => {
    practiceRef.current = practice;
  }, [practice]);

  const padRefs = useRef<Record<string, React.MutableRefObject<VectorPadState>>>(
      {},
  );

  function getPadRef(id: string) {
    if (!padRefs.current[id]) {
      padRefs.current[id] = { current: defaultVectorPadState() };
    }
    return padRefs.current[id];
  }

  useEffect(() => {
    setPractice({});
    padRefs.current = {};
  }, [resetKey]);

  useEffect(() => {
    if (!questions.length) return;

    let cancelled = false;

    async function ensurePracticeQuestion(q: ReviewQuestion) {
      if (q.kind !== "practice") return;

      const existing = practiceRef.current?.[q.id];
      if (existing && (existing.loading || existing.exercise || existing.item)) {
        return;
      }

      setPractice((prev) => {
        if (prev[q.id]) return prev;

        const initMeta = initialState?.practiceMeta?.[q.id];
        const fallbackMax =
            unlimitedAttempts
                ? null
                : coerceMaxAttempts((q as any).maxAttempts ?? specMaxAttempts ?? null);

        return {
          ...prev,
          [q.id]: {
            loading: true,
            error: null,
            busy: false,
            exercise: null,
            item: null,
            attempts: initMeta?.attempts ?? 0,
            ok: initMeta?.ok ?? null,
            maxAttempts: fallbackMax,
          },
        };
      });

      try {
        const loaded = await fetchResolvedPracticeItem({
          request: {
            subject: (q as any).fetch.subject,
            module: (q as any).fetch.module,
            section: (q as any).fetch.section,
            topic: (q as any).fetch.topic ? String((q as any).fetch.topic) : "",
            difficulty: (q as any).fetch.difficulty,
            allowReveal: (q as any).fetch.allowReveal ? true : undefined,
            preferKind: (q as any).fetch.preferKind ?? undefined,
            salt: (q as any).fetch.salt ?? undefined,
            preferPurpose: "mixed",
            purposePolicy: "fallback",
            exerciseKey: (q as any).fetch.exerciseKey ?? undefined,
            seedPolicy: (q as any).fetch.seedPolicy ?? undefined,
          },
          resolvers: {
            raw: (k) => rawKeyRef.current(k),
            resolveText: (value) => resolveTextRef.current(value),
          },
          savedPatch: initialState?.practiceItemPatch?.[q.id] ?? null,
          transformItem: (baseItem, resolvedEx) => {
            const mode = (spec as any).mode ?? "quiz";
            const carryFromPrev =
                mode === "project" && Boolean((q as any).carryFromPrev);

            if (!carryFromPrev || (resolvedEx as any).kind !== "code_input") {
              return baseItem;
            }

            const idx = questions.findIndex((qq) => qq.id === q.id);
            const prevQ = idx > 0 ? questions[idx - 1] : null;

            const rawCurrentPatch = initialState?.practiceItemPatch?.[q.id];
            const currentPatch = rawCurrentPatch
                ? resolveDeepTagged(rawCurrentPatch, (k) => rawKeyRef.current(k))
                : null;

            const current = extractCodeLike(currentPatch);

            let prevSource: any = null;
            if (prevQ) {
              const livePrevItem = practiceRef.current?.[prevQ.id]?.item;
              const rawPrevSource =
                  livePrevItem ?? initialState?.practiceItemPatch?.[prevQ.id] ?? null;

              prevSource = rawPrevSource
                  ? resolveDeepTagged(rawPrevSource, (k) => rawKeyRef.current(k))
                  : null;
            }

            const prev = extractCodeLike(prevSource);

            if (!current.code && prev.code) {
              return {
                ...baseItem,
                code: prev.code,
                codeStdin: prev.stdin ?? (baseItem as any).codeStdin ?? "",
                codeLang: (prev.language as any) ?? (baseItem as any).codeLang,
                stdin: prev.stdin ?? (baseItem as any).stdin ?? "",
              };
            }

            return baseItem;
          },
        });

        if (cancelled) return;

        setPractice((prev) => {
          const base = prev[q.id];

          return {
            ...prev,
            [q.id]: {
              ...base,
              loading: false,
              error: null,
              exercise: loaded.exercise,
              item: loaded.item,
              attempts:
                  initialState?.practiceMeta?.[q.id]?.attempts ??
                  base?.attempts ??
                  0,
              ok: initialState?.practiceMeta?.[q.id]?.ok ?? base?.ok ?? null,
              maxAttempts: loaded.maxAttempts ?? base?.maxAttempts ?? null,
            },
          };
        });
      } catch (e: any) {
        if (cancelled) return;

        setPractice((prev) => ({
          ...prev,
          [q.id]: {
            ...prev[q.id],
            loading: false,
            error: e?.message ?? "Failed to load practice exercise.",
            busy: false,
          },
        }));
      }
    }

    for (const q of questions) {
      void ensurePracticeQuestion(q);
    }

    return () => {
      cancelled = true;
    };
  }, [
    questions,
    unlimitedAttempts,
    specMaxAttempts,
    resetKey,
    initialState,
    spec,
  ]);

  const updatePracticeItem = useCallback((qid: string, patch: Partial<QItem>) => {
    const pr = padRefs.current[qid];
    if (pr?.current) {
      if ((patch as any).dragA) pr.current.a = cloneVec((patch as any).dragA) as any;
      if ((patch as any).dragB) pr.current.b = cloneVec((patch as any).dragB) as any;
    }

    setPractice((prev) => {
      const ps = prev[qid];
      if (!ps?.item) return prev;

      const nextItem = { ...ps.item, ...patch };

      const isReset =
          ("submitted" in patch && (patch as any).submitted === false) ||
          ("result" in patch && (patch as any).result == null);

      return {
        ...prev,
        [qid]: {
          ...ps,
          item: nextItem,
          ok: isReset ? null : ps.ok,
        },
      };
    });
  }, []);

  const submitPractice = useCallback(
      async (q: Extract<ReviewQuestion, { kind: "practice" }>) => {
        if (isCompleted || locked) return;

        const ps = practice[q.id];
        if (!ps || ps.loading || ps.busy || !ps.item || !ps.exercise) return;

        const attemptsCapped =
            !unlimitedAttempts &&
            ps.maxAttempts != null &&
            ps.attempts >= ps.maxAttempts;

        if (attemptsCapped) return;
        if (ps.ok === true) return;

        setPractice((prev) => ({
          ...prev,
          [q.id]: { ...prev[q.id], busy: true, error: null },
        }));

        try {
          const submitted = await submitPracticeItem({
            item: ps.item,
            exercise: ps.exercise,
            padRef: getPadRef(q.id),
            maxAttempts: ps.maxAttempts,
            isLockedRun: !unlimitedAttempts && ps.maxAttempts != null,
          });

          emitSfx(submitted.ok ? "answer:correct" : "answer:wrong");

          setPractice((prev) => {
            const nextAttempts = submitted.used;

            return {
              ...prev,
              [q.id]: {
                ...prev[q.id],
                busy: false,
                attempts: nextAttempts,
                ok: submitted.ok,
                maxAttempts: submitted.serverMaxAttempts ?? prev[q.id].maxAttempts ?? null,
                item: {
                  ...prev[q.id].item!,
                  ...(submitted.statePatch ?? {}),
                  result: submitted.data as any,
                  submitted: true,
                  attempts: nextAttempts,
                } as any,
              },
            };
          });
        } catch (e: any) {
          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              busy: false,
              error: e?.message ?? "Submit failed.",
            },
          }));
        }
      },
      [practice, unlimitedAttempts, isCompleted, locked],
  );

  const revealPractice = useCallback(
      async (q: Extract<ReviewQuestion, { kind: "practice" }>) => {
        if (isCompleted || locked) return;

        const ps = practice[q.id];
        if (!ps || ps.loading || ps.busy || !ps.item) return;

        setPractice((prev) => ({
          ...prev,
          [q.id]: { ...prev[q.id], busy: true, error: null },
        }));

        try {
          const revealed = await revealPracticeItem(ps.item);

          if (revealed.dragA) {
            updatePracticeItem(q.id, { dragA: revealed.dragA } as any);
          }
          if (revealed.dragB) {
            updatePracticeItem(q.id, { dragB: revealed.dragB } as any);
          }

          const pr = getPadRef(q.id);
          if (pr.current) {
            if (revealed.dragA) pr.current.a = cloneVec(revealed.dragA) as any;
            if (revealed.dragB) pr.current.b = cloneVec(revealed.dragB) as any;
          }

          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              busy: false,
              error: null,
              ok: false,
              item: {
                ...prev[q.id].item!,
                result: revealed.data as any,
                revealed: true,
                submitted: true,
              } as any,
            },
          }));
        } catch (e: any) {
          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              busy: false,
              error: e?.message ?? "Reveal failed.",
            },
          }));
        }
      },
      [practice, isCompleted, locked, updatePracticeItem],
  );

  function isPracticeChecked(q: Extract<ReviewQuestion, { kind: "practice" }>) {
    const ps = practice[q.id];
    return Boolean(ps && ps.attempts > 0);
  }

  return {
    practice,
    setPractice,
    getPadRef,
    updatePracticeItem,
    submitPractice,
    revealPractice,
    isPracticeChecked,
  };
}