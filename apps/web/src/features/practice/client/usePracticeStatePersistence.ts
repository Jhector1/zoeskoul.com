"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { Difficulty } from "@/lib/practice/types";
import type { PracticeRunMetaApi } from "@/lib/practice/apiTypes";
import type { QItem, TopicValue } from "@/lib/practice/uiTypes";
import { normalizeTopicValue } from "@/lib/practice/uiHelpers";

import { SESSION_DEFAULT, STORAGE_VERSION } from "./constants";
import {
  lastSessionKey,
  loadSavedState,
  pruneExpiredStack,
  storageKeyForState,
} from "./storage";

export type Phase = "practice" | "summary";
export type RunMeta = PracticeRunMetaApi;
export type { TopicValue };

export function usePracticeStatePersistence(args: {
  subjectSlug?: string;
  moduleSlug?: string;

  section: string | null;
  topic: TopicValue;
  difficulty: Difficulty | "all";
  sessionId: string | null;
  run: RunMeta | null;

  phase: Phase;
  autoSummarized: boolean;
  completed: boolean;
  showMissed: boolean;

  stack: QItem[];
  idx: number;
  sessionSize: number;

  setSection: (v: string | null) => void;
  setTopic: (v: TopicValue) => void;
  setDifficulty: (v: Difficulty | "all") => void;
  setSessionId: (v: string | null) => void;
  setRun: (v: RunMeta | null) => void;

  setPhase: (v: Phase) => void;
  setAutoSummarized: (v: boolean) => void;
  setCompleted: (v: boolean) => void;
  setShowMissed: (v: boolean) => void;

  setStack: (v: QItem[]) => void;
  setIdx: (v: number) => void;
  setSessionSize: (v: number) => void;

  setLoadErr: (v: string | null) => void;

  firstFiltersEffectRef: MutableRefObject<boolean>;
  skipUrlSyncRef: MutableRefObject<boolean>;
}) {
  const {
    subjectSlug,
    moduleSlug,

    section,
    topic,
    difficulty,
    sessionId,
    run,

    phase,
    autoSummarized,
    completed,
    showMissed,

    stack,
    idx,
    sessionSize,

    setSection,
    setTopic,
    setDifficulty,
    setSessionId,
    setRun,

    setPhase,
    setAutoSummarized,
    setCompleted,
    setShowMissed,

    setStack,
    setIdx,
    setSessionSize,

    setLoadErr,

    firstFiltersEffectRef,
    skipUrlSyncRef,
  } = args;

  const [hydrated, setHydrated] = useState(false);

  const resolvedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydrated) return;

    const sp = new URLSearchParams(window.location.search);

    const sectionParam = sp.get("section");
    const difficultyParam = sp.get("difficulty");
    const topicParam = sp.get("topic");

    const nextSection = sectionParam ?? null;

    const nextDifficulty: Difficulty | "all" =
        difficultyParam === "easy" ||
        difficultyParam === "medium" ||
        difficultyParam === "hard" ||
        difficultyParam === "all"
            ? difficultyParam
            : "all";

    const nextTopic = normalizeTopicValue(topicParam);

    const questionCountParam = sp.get("questionCount");
    const qcParsed = questionCountParam ? parseInt(questionCountParam, 10) : NaN;
    const sizeFromParam =
        Number.isFinite(qcParsed) && qcParsed > 0 ? qcParsed : null;
    const initialSize = sizeFromParam ?? SESSION_DEFAULT;

    if (!subjectSlug || !moduleSlug) {
      resolvedSessionIdRef.current = null;

      setSection(nextSection);
      setTopic(nextTopic as TopicValue);
      setDifficulty(nextDifficulty);
      setSessionId(null);
      setRun(null);

      setSessionSize(initialSize);

      setCompleted(false);
      setPhase("practice");
      setAutoSummarized(false);
      setShowMissed(true);

      setStack([]);
      setIdx(0);

      setLoadErr(null);

      firstFiltersEffectRef.current = true;
      skipUrlSyncRef.current = true;
      setHydrated(true);
      return;
    }

    let sidParam = sp.get("sessionId");
    if (!sidParam) {
      try {
        sidParam = localStorage.getItem(lastSessionKey(subjectSlug, moduleSlug)) || null;
      } catch {}
    }

    resolvedSessionIdRef.current = sidParam ?? null;
    if (sidParam) setSessionId(sidParam);

    setSessionSize(initialSize);

    let loaded: ReturnType<typeof loadSavedState> = null;
    try {
      loaded = loadSavedState({
        subjectSlug,
        moduleSlug,
        section: nextSection,
        topic: String(nextTopic),
        difficulty: String(nextDifficulty),
        n: initialSize,
        sessionId: sidParam ?? null,
      });
    } catch {
      loaded = null;
    }

    if (loaded) {
      const saved = loaded.payload;

      setSection(saved.section ?? nextSection);
      setTopic((saved.topic ?? nextTopic) as TopicValue);
      setDifficulty((saved.difficulty ?? nextDifficulty) as Difficulty | "all");

      if (saved.run?.mode) setRun(saved.run);
      setSessionId(saved.sessionId ?? sidParam ?? null);

      const restoredStack = Array.isArray(saved.stack) ? saved.stack : [];
      const cleaned = pruneExpiredStack(restoredStack);
      setStack(cleaned);

      setIdx(
          typeof saved.idx === "number"
              ? Math.max(0, Math.min(saved.idx, Math.max(0, cleaned.length - 1)))
              : 0,
      );

      const restoredSize =
          typeof saved.sessionSize === "number" && saved.sessionSize > 0
              ? saved.sessionSize
              : initialSize;
      setSessionSize(restoredSize);

      const savedCompleted = Boolean(
          saved.completed ?? saved.autoSummarized ?? (saved.phase === "summary"),
      );

      setCompleted(savedCompleted);

      if (savedCompleted) {
        setAutoSummarized(true);
        setPhase("summary");
      } else {
        const emptyAfterPrune = cleaned.length === 0;
        setPhase(emptyAfterPrune ? "practice" : (saved.phase ?? "practice"));
        setAutoSummarized(Boolean(saved.autoSummarized ?? (saved.phase === "summary")));
      }

      setShowMissed(saved.showMissed ?? true);

      try {
        if (!sidParam && loaded.key !== loaded.canonicalKey) {
          sessionStorage.setItem(loaded.canonicalKey, JSON.stringify(saved));
        }
      } catch {}

      setLoadErr(null);
      firstFiltersEffectRef.current = true;
      skipUrlSyncRef.current = true;
      setHydrated(true);
      return;
    }

    setSection(nextSection);
    setTopic(nextTopic as TopicValue);
    setDifficulty(nextDifficulty);

    setCompleted(false);
    setPhase("practice");
    setAutoSummarized(false);
    setShowMissed(true);

    setStack([]);
    setIdx(0);

    setLoadErr(null);

    firstFiltersEffectRef.current = true;
    skipUrlSyncRef.current = true;
    setHydrated(true);
  }, [
    hydrated,
    subjectSlug,
    moduleSlug,
    setSection,
    setTopic,
    setDifficulty,
    setSessionId,
    setRun,
    setPhase,
    setAutoSummarized,
    setCompleted,
    setShowMissed,
    setStack,
    setIdx,
    setSessionSize,
    setLoadErr,
    firstFiltersEffectRef,
    skipUrlSyncRef,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (!subjectSlug || !moduleSlug) return;

    const payload = {
      v: STORAGE_VERSION,
      savedAt: Date.now(),

      section,
      topic,
      difficulty,
      sessionId,
      run,

      phase,
      autoSummarized,
      completed,
      showMissed,

      stack,
      idx,
      sessionSize,
    };

    try {
      sessionStorage.setItem(
          storageKeyForState({
            subjectSlug,
            moduleSlug,
            section,
            topic: String(topic),
            difficulty: String(difficulty),
            n: sessionSize,
            sessionId,
          }),
          JSON.stringify(payload),
      );
    } catch {}
  }, [
    hydrated,
    subjectSlug,
    moduleSlug,
    section,
    topic,
    difficulty,
    sessionId,
    run,
    phase,
    autoSummarized,
    completed,
    showMissed,
    stack,
    idx,
    sessionSize,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (!subjectSlug || !moduleSlug) return;
    if (!sessionId) return;

    try {
      localStorage.setItem(lastSessionKey(subjectSlug, moduleSlug), sessionId);
    } catch {}
  }, [hydrated, sessionId, subjectSlug, moduleSlug]);

  return { hydrated, resolvedSessionIdRef };
}