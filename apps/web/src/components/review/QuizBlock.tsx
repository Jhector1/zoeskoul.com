"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";
import { buildReviewQuizKey } from "@/lib/subjects/quizClient";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

import { useQuizLocalAnswers } from "./quiz/hooks/useQuizLocalAnswers";
import { useQuizPracticeBank } from "./quiz/hooks/useQuizPracticeBank";
import { useDebouncedEmit } from "./quiz/hooks/useDebouncedEmit";
import { useReviewQuizQuestions } from "./quiz/hooks/useReviewQuizQuestions";

import QuizPracticeCard from "./quiz/components/QuizPracticeCard";
import QuizLocalCard from "./quiz/components/QuizLocalCard";
import QuizFooter from "./quiz/components/QuizFooter";
import { emitSfx } from "@/lib/sfx/bus";
import { QuizBlockSkeleton } from "@/components/review/quiz/components/QuizBlockSkeleton";

import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";
import { useTaggedT } from "@/i18n/tagged";
import FlowNavigator, {
  type FlowNavMode,
} from "@/components/review/navigation/FlowNavigator";

const LS_AUTO_ADV = "learnoir.quiz.autoAdvance";

function readAutoAdvance(defaultVal = true) {
  try {
    const v = window.localStorage.getItem(LS_AUTO_ADV);
    if (v == null) return defaultVal;
    return v === "1" || v === "true";
  } catch {
    return defaultVal;
  }
}

function computeLocalOkNow(
    q: Exclude<ReviewQuestion, { kind: "practice" }>,
    val: any,
) {
  if (q.kind === "mcq") return val === q.answerId;

  const v = Number(val);
  if (!Number.isFinite(v)) return false;
  const tol = q.tolerance ?? 0;
  return Math.abs(v - q.answer) <= tol;
}
function serializePracticeItemForSave(item: any, exercise: any) {
  const { key, kind, ui, ...rest } = item ?? {};

  if (exercise?.kind === "drag_reorder" && !ui?.reorderTouched) {
    delete rest.reorder;
    delete rest.reorderIds;
  }

  return rest;
}
export default function QuizBlock({
                                    prereqsMet = true,
                                    quizId,
                                    spec,
                                    quizKey,
                                    navigationMode = "scroll",
                                    passScore,
                                    onPass,
                                    sequential = true,
                                    unlimitedAttempts = true,
                                    initialState,
                                    onStateChange,
                                    isCompleted = false,
                                    quizCardId,
                                    locked = false,
                                    strictSequential = false,
                                    onReset,
                                    orderBase = 0,
                                    toolsActive = true,
                                  }: {
  prereqsMet?: boolean;
  quizId: string;
  spec: ReviewQuizSpec;
  quizKey?: string;
  navigationMode?: FlowNavMode;
  passScore: number;
  onPass: () => void;
  sequential?: boolean;
  unlimitedAttempts?: boolean;

  initialState?: SavedQuizState | null;
  onStateChange?: (s: SavedQuizState) => void;

  isCompleted?: boolean;
  quizCardId?: string;
  locked?: boolean;
  strictSequential?: boolean;

  onReset?: () => void;
  orderBase?: number;
  toolsActive?: boolean;
}) {
  const initState = initialState ?? null;

  const stableQuizKeyRef = useRef<string>("");
  if (!stableQuizKeyRef.current) {
    stableQuizKeyRef.current = quizKey?.trim()
        ? quizKey.trim()
        : buildReviewQuizKey(spec, quizCardId ?? quizId, 0);
  }
  const stableKey = stableQuizKeyRef.current;

  const [reloadNonce, setReloadNonce] = useState(0);
  const resetKey = `${stableKey}:${reloadNonce}`;

  const { quizLoading, quizError, questions, serverQuizKey } =
      useReviewQuizQuestions({
        quizId,
        spec,
        stableQuizKey: stableKey,
        reloadNonce,
      });

  const [excusedById, setExcusedById] = useState<Record<string, boolean>>({});
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmResetQuiz, setConfirmResetQuiz] = useState(false);
  const [awaitNextQid, setAwaitNextQid] = useState<string | null>(null);
  const [pendingScrollQid, setPendingScrollQid] = useState<string | null>(null);
  const [pendingScrollMode, setPendingScrollMode] = useState<"explain" | "end">("end");

  const onPassRef = useRef(onPass);
  const autoKeyRef = useRef<string>("");
  const restoreQuestionKeyRef = useRef<string>("");
  const lastActionQidRef = useRef<string | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const qElRef = useRef(new Map<string, HTMLDivElement | null>());
  const footerElRef = useRef<HTMLDivElement | null>(null);
  const endAnchorRef = useRef(new Map<string, HTMLDivElement | null>());
  const explainRef = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    onPassRef.current = onPass;
  }, [onPass]);

  useEffect(() => {
    setExcusedById(initState?.excusedById ?? {});
  }, [resetKey, initState?.excusedById]);

  const isExcused = useCallback(
      (qid: string) => Boolean(excusedById[qid]),
      [excusedById],
  );

  const local = useQuizLocalAnswers();

  const practiceBank = useQuizPracticeBank({
    questions,
    spec,
    unlimitedAttempts,
    initialState: initState,
    resetKey,
    isCompleted,
    locked,
  });

  useEffect(() => {
    local.hydrate(initState);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function getQuestionOk(q: ReviewQuestion): boolean | null {
    if (q.kind === "mcq") {
      if (!local.checkedById[q.id]) return null;
      return local.answers[q.id] === q.answerId;
    }
    if (q.kind === "numeric") {
      if (!local.checkedById[q.id]) return null;
      const v = Number(local.answers[q.id]);
      if (!Number.isFinite(v)) return false;
      const tol = q.tolerance ?? 0;
      return Math.abs(v - q.answer) <= tol;
    }
    if (q.kind === "practice") {
      const ps = practiceBank.practice[q.id];
      return ps ? ps.ok : null;
    }
    return null;
  }

  function isQuestionChecked(q: ReviewQuestion): boolean {
    if (isExcused(q.id)) return true;
    if (q.kind === "practice") return practiceBank.isPracticeChecked(q);
    return Boolean(local.checkedById[q.id]);
  }

  function isUnlocked(index: number): boolean {
    if (!prereqsMet) return false;
    if (!sequential) return true;
    if (index === 0) return true;

    const prev = questions[index - 1];
    if (isExcused(prev.id)) return true;

    const ok = getQuestionOk(prev) === true;

    if (!ok) {
      if (strictSequential) return false;

      if (prev.kind === "practice") {
        const ps = practiceBank.practice[prev.id];
        const maxA = ps?.maxAttempts;
        const attemptsCapped =
            !!ps &&
            !unlimitedAttempts &&
            typeof maxA === "number" &&
            Number.isFinite(maxA) &&
            ps.attempts >= maxA;
        if (attemptsCapped) return true;
      }
    }
    return ok;
  }

  const summary = useMemo(() => {
    let checkedCount = 0;
    let correctCount = 0;
    let denom = 0;
    let excusedCount = 0;

    for (const q of questions) {
      if (isQuestionChecked(q)) checkedCount++;

      if (isExcused(q.id)) {
        excusedCount++;
        continue;
      }

      denom++;
      if (getQuestionOk(q) === true) correctCount++;
    }

    const allChecked = checkedCount >= questions.length && questions.length > 0;
    const score = denom === 0 ? 1 : correctCount / denom;
    const passed = allChecked && (denom === 0 ? true : score >= passScore);

    return {
      checkedCount,
      correctCount,
      total: questions.length,
      denom,
      score,
      allChecked,
      passed,
      excusedCount,
    };
  }, [questions, local.checkedById, local.answers, practiceBank.practice, passScore, excusedById]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prereqsMet || locked || isCompleted) return;
    if (!summary.passed) return;

    if (autoKeyRef.current === resetKey) return;
    autoKeyRef.current = resetKey;

    onPassRef.current();
  }, [prereqsMet, locked, isCompleted, summary.passed, resetKey]);

  const nextState = useMemo<SavedQuizState>(() => {
    const base = initState;

    const practiceItemPatch: Record<string, any> = {
      ...(base?.practiceItemPatch ?? {}),
    };
    const practiceMeta: Record<string, any> = { ...(base?.practiceMeta ?? {}) };

    for (const q of questions) {
      if (q.kind !== "practice") continue;

      const ps = practiceBank.practice[q.id];
      if (ps) {
        practiceMeta[q.id] = {
          attempts: ps.attempts ?? practiceMeta[q.id]?.attempts ?? 0,
          ok: ps.ok ?? practiceMeta[q.id]?.ok ?? null,
        };
      }

      if (ps?.item) {
        practiceItemPatch[q.id] = serializePracticeItemForSave(ps.item, ps.exercise);
      }
    }

    return {
      answers: local.answers,
      checkedById: local.checkedById,
      practiceItemPatch,
      practiceMeta,
      excusedById,
    };
  }, [questions, local.answers, local.checkedById, practiceBank.practice, initState, excusedById]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAutoAdvance(readAutoAdvance(true));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_AUTO_ADV, autoAdvance ? "1" : "0");
    } catch {}
  }, [autoAdvance]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(Boolean(mq.matches));
    apply();

    if (mq.addEventListener) mq.addEventListener("change", apply);
    else (mq as any).addListener?.(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else (mq as any).removeListener?.(apply);
    };
  }, []);

  function setQuestionEl(qid: string) {
    return (el: HTMLDivElement | null) => {
      qElRef.current.set(qid, el);
    };
  }

  const setEndAnchor = useCallback(
      (qid: string) => (el: HTMLDivElement | null) => {
        endAnchorRef.current.set(qid, el);
      },
      [],
  );

  const setExplainEl = useCallback(
      (qid: string) => (el: HTMLDivElement | null) => {
        explainRef.current.set(qid, el);
      },
      [],
  );

  const findCurrentActivityQuestionId = useCallback(() => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!isUnlocked(i)) break;
      if (!isFlowDone(q)) return q.id;
    }

    return questions[questions.length - 1]?.id ?? null;
  }, [
    questions,
    local.checkedById,
    local.answers,
    practiceBank.practice,
    excusedById,
    strictSequential,
    unlimitedAttempts,
    prereqsMet,
    locked,
    isCompleted,
  ]);

  const findCurrentActivityQuestionIndex = useCallback(() => {
    const qid = findCurrentActivityQuestionId();
    if (!qid) return 0;
    const idx = questions.findIndex((q) => q.id === qid);
    return idx < 0 ? 0 : idx;
  }, [findCurrentActivityQuestionId, questions]);

  useEffect(() => {
    setAwaitNextQid(null);
  }, [resetKey]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function scheduleScroll(qid: string, mode: "explain" | "end") {
    setPendingScrollMode(mode);
    setPendingScrollQid(qid);
  }

  function focusPrimaryActionForQuestion(qid: string) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = qElRef.current.get(qid);
        if (!root) return;

        const target =
            root.querySelector<HTMLElement>('[data-flow-focus]:not([disabled])') ??
            root.querySelector<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
            );

        target?.focus({ preventScroll: true } as any);
      });
    });
  }

  useEffect(() => {
    if (!pendingScrollQid) return;

    requestAnimationFrame(() => {
      const qid = pendingScrollQid;

      const explainEl =
          pendingScrollMode === "explain" ? explainRef.current.get(qid) : null;
      const endEl = endAnchorRef.current.get(qid);
      const root = qElRef.current.get(qid);

      const target = explainEl ?? endEl ?? root;
      if (!target) {
        setPendingScrollQid(null);
        return;
      }

      scrollIntoViewSmart(target, {
        reduceMotion,
        block: explainEl ? "start" : "end",
        force: true,
        offsetPx: 12,
        focus: false,
      });

      setPendingScrollQid(null);
    });
  }, [pendingScrollQid, pendingScrollMode, reduceMotion]);

  useEffect(() => {
    if (quizLoading) return;
    if (!questions.length) return;

    const restoreKey = `${resetKey}:restore`;
    if (restoreQuestionKeyRef.current === restoreKey) return;

    if (navigationMode === "slideshow") {
      restoreQuestionKeyRef.current = restoreKey;
      setActiveIndex(findCurrentActivityQuestionIndex());
      return;
    }

    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 12;

    const tryRestore = () => {
      if (cancelled) return;

      const qid = findCurrentActivityQuestionId();
      if (!qid) {
        restoreQuestionKeyRef.current = restoreKey;
        scrollToFooter();
        return;
      }

      const el = qElRef.current.get(qid);

      if (!el) {
        if (tries < MAX_TRIES) {
          tries += 1;
          requestAnimationFrame(() => {
            requestAnimationFrame(tryRestore);
          });
        }
        return;
      }

      restoreQuestionKeyRef.current = restoreKey;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;

          scrollIntoViewSmart(el, {
            reduceMotion,
            block: "start",
            force: true,
            offsetPx: 12,
            focus: false,
          });
        });
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryRestore);
    });

    return () => {
      cancelled = true;
    };
  }, [
    quizLoading,
    questions,
    resetKey,
    findCurrentActivityQuestionId,
    findCurrentActivityQuestionIndex,
    reduceMotion,
    navigationMode,
  ]);

  function scrollToFooter() {
    const el = footerElRef.current;
    if (!el) return;
    scrollIntoViewSmart(el, { reduceMotion, block: "start", force: true, offsetPx: 12 });
  }

  function findNextUnlockedIndex(fromIdx: number) {
    for (let i = fromIdx + 1; i < questions.length; i++) {
      if (isUnlocked(i)) return i;
    }
    return -1;
  }

  function advanceFrom(qid: string) {
    const idx = questions.findIndex((qq) => qq.id === qid);
    if (idx < 0) return;

    const nextIdx = findNextUnlockedIndex(idx);
    if (nextIdx < 0) {
      scrollToFooter();
      return;
    }

    const nextQ = questions[nextIdx];

    if (navigationMode === "slideshow") {
      setActiveIndex(nextIdx);
      focusPrimaryActionForQuestion(nextQ.id);
      return;
    }

    const el = qElRef.current.get(nextQ.id);
    if (el) {
      scrollIntoViewSmart(el, {
        reduceMotion,
        block: "start",
        force: true,
        offsetPx: 12,
        focus: true,
      });
    }
  }

  function isFlowDone(q: ReviewQuestion): boolean {
    if (isExcused(q.id)) return true;

    if (q.kind === "practice") {
      const ps = practiceBank.practice[q.id];
      if (ps?.ok === true) return true;

      const maxA = ps?.maxAttempts;
      const outOfAttempts =
          !!ps &&
          !unlimitedAttempts &&
          typeof maxA === "number" &&
          Number.isFinite(maxA) &&
          ps.attempts >= maxA;

      if (!strictSequential && outOfAttempts) return true;
      return false;
    }

    return getQuestionOk(q) === true;
  }

  function hasExplain(q: ReviewQuestion) {
    const ex = (q as any).explain;
    return typeof ex === "string" && ex.trim().length > 0;
  }

  useEffect(() => {
    if (!prereqsMet || locked || isCompleted) return;

    const qid = lastActionQidRef.current;
    if (!qid) return;

    const q = questions.find((x) => x.id === qid);
    if (!q) return;

    if (!isFlowDone(q)) return;

    if (hasExplain(q) || !autoAdvance) {
      setAwaitNextQid(qid);
      lastActionQidRef.current = null;
      return;
    }

    const delay = 150;

    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceFrom(qid);
      lastActionQidRef.current = null;
      advanceTimerRef.current = null;
    }, delay);
  }, [
    prereqsMet,
    locked,
    isCompleted,
    questions,
    local.checkedById,
    local.answers,
    practiceBank.practice,
    excusedById,
    strictSequential,
    unlimitedAttempts,
    autoAdvance,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitState = useCallback((s: SavedQuizState) => onStateChange?.(s), [onStateChange]);
  const ui = useTaggedT("reviewQuizUi");
  const emitter = useDebouncedEmit(nextState, emitState, {
    delayMs: 400,
    enabled: Boolean(onStateChange && questions.length),
  });

  useLayoutEffect(() => {
    emitter.prime({
      answers: initState?.answers ?? {},
      checkedById: initState?.checkedById ?? {},
      practiceItemPatch: initState?.practiceItemPatch ?? {},
      practiceMeta: initState?.practiceMeta ?? {},
      excusedById: initState?.excusedById ?? {},
    } as SavedQuizState);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onStateChange || !questions.length) return;

    const flush = () => emitter.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [emitter.flush, onStateChange, questions.length]);

  async function resetThisQuiz() {
    const key = (serverQuizKey || stableKey).trim();
    if (!key) return;

    await fetch(`/api/review/quiz?quizKey=${encodeURIComponent(key)}`, {
      method: "DELETE",
      cache: "no-store",
    });

    onReset?.();
    local.reset();
    practiceBank.setPractice({});
    setExcusedById({});
    setReloadNonce((n) => n + 1);
    setActiveIndex(0);
  }

  if (quizLoading) return <QuizBlockSkeleton />;

  if (quizError) {
    return <div className="ui-quiz-note-danger">{quizError}</div>;
  }

  if (!questions.length) {
    return <div className="mt-2 ui-quiz-status-soft">{ui.t("noQuestions", {}, "No questions.")}</div>;
  }

  const nextSlideIndex =
      navigationMode === "slideshow" ? findNextUnlockedIndex(activeIndex) : -1;

  function renderQuestionItem(q: ReviewQuestion, idx: number) {
    const unlocked = isUnlocked(idx);

    const showNext =
        awaitNextQid === q.id &&
        prereqsMet &&
        !locked &&
        !isCompleted &&
        isFlowDone(q);

    const nextIdx = findNextUnlockedIndex(idx);
    const isLast = nextIdx < 0;

    return (
        <div className="ui-page-surface" key={q.id} ref={setQuestionEl(q.id)} data-qid={q.id}>
          {q.kind === "practice" ? (
              <QuizPracticeCard
                  q={q}
                  ps={practiceBank.practice[q.id]}
                  toolScopedId={`${stableKey}:${q.id}`}
                  toolsActive={toolsActive}
                  unlocked={unlocked}
                  isCompleted={isCompleted}
                  locked={locked}
                  unlimitedAttempts={unlimitedAttempts}
                  strictSequential={strictSequential}
                  seqOrder={orderBase + idx}
                  padRef={practiceBank.getPadRef(q.id) as any}
                  excused={isExcused(q.id)}
                  onRetryExercise={() => practiceBank.retryPracticeQuestion(q.id)}
                  onExcused={() => {
                    if (!unlocked) return;
                    const ps0 = practiceBank.practice[q.id];
                    if (!ps0?.error) return;

                    setExcusedById((prev) => ({ ...prev, [q.id]: true }));
                    lastActionQidRef.current = q.id;
                    scheduleScroll(q.id, "end");
                  }}
                  onUpdateItem={(patch) => practiceBank.updatePracticeItem(q.id, patch)}
                  onSubmit={() => {
                    lastActionQidRef.current = q.id;
                    scheduleScroll(q.id, "end");
                    void practiceBank.submitPractice(q);
                  }}
                  onHelp={(stepKey) => {
                    scheduleScroll(q.id, "end");
                    void practiceBank.openPracticeHelp(q, stepKey);
                  }}
              />
          ) : (
              <QuizLocalCard
                  prereqsMet={prereqsMet}
                  q={q}
                  unlocked={unlocked}
                  isCompleted={isCompleted}
                  locked={locked}
                  value={local.answers[q.id]}
                  checked={Boolean(local.checkedById[q.id])}
                  ok={getQuestionOk(q)}
                  onPick={(val) => local.setAnswer(q.id, val)}
                  explainRef={setExplainEl(q.id)}
                  onCheck={() => {
                    if (isCompleted || locked) return;
                    if (local.checkedById[q.id]) return;

                    lastActionQidRef.current = q.id;

                    const okNow = computeLocalOkNow(q, local.answers[q.id]);

                    local.check(q.id);
                    emitSfx(okNow ? "answer:correct" : "answer:wrong");
                    scheduleScroll(q.id, "explain");
                  }}
              />
          )}

          {showNext ? (
              <div className="mt-2 flex justify-end">
                <button
                    type="button"
                    className="ui-quiz-action ui-quiz-action--primary"
                    data-flow-focus="1"
                    onClick={() => {
                      setAwaitNextQid(null);
                      if (isLast) scrollToFooter();
                      else advanceFrom(q.id);
                    }}
                >
                  {isLast
                      ? ui.t("buttons.finish", {}, "Finish →")
                      : ui.t("buttons.next", {}, "Next →")}
                </button>
              </div>
          ) : null}

          <div ref={setEndAnchor(q.id)} className="h-0" aria-hidden />
        </div>
    );
  }

  return (
      <div className="mt-3 grid gap-3">
        <FlowNavigator
            items={questions}
            mode={navigationMode}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            reduceMotion={reduceMotion}
            getKey={(q) => q.id}
            getProgressLabel={(index, total) =>
                ui.t("progress.question", { current: index + 1, total }, `Question ${index + 1} of ${total}`)
            }
            canGoPrev={activeIndex > 0}
            canGoNext={nextSlideIndex >= 0}
            onPrev={() => {
              setAwaitNextQid(null);
              setActiveIndex((i) => Math.max(0, i - 1));
            }}
            onNext={() => {
              if (nextSlideIndex < 0) return;
              setAwaitNextQid(null);
              setActiveIndex(nextSlideIndex);
              const nextQ = questions[nextSlideIndex];
              if (nextQ) focusPrimaryActionForQuestion(nextQ.id);
            }}
            renderItem={renderQuestionItem}
        />

        <div ref={footerElRef}>
          <div className="ui-quiz-toggle-row">
            <label className="ui-quiz-toggle-label">
              <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => {
                    setAwaitNextQid(null);
                    setAutoAdvance(e.target.checked);
                  }}
              />
              {ui.t("autoAdvance", {}, "Auto-advance")}
            </label>
          </div>

          <QuizFooter
              checkedCount={summary.checkedCount}
              correctCount={summary.correctCount}
              total={summary.total}
              scorePct={Math.round(summary.score * 100)}
              isCompleted={isCompleted}
              passed={summary.passed}
              sequential={sequential}
              onResetClick={() => setConfirmResetQuiz(true)}
          />
        </div>

        <ConfirmDialog
            open={confirmResetQuiz}
            onOpenChange={setConfirmResetQuiz}
            danger
            title={ui.t("resetDialog.title", {}, "Reset this quiz?")}
            confirmLabel={ui.t("resetDialog.confirm", {}, "Reset quiz")}
            description={
              <div className="grid gap-2">
                <div>{ui.t("resetDialog.intro", {}, "This will:")}</div>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{ui.t("resetDialog.b1", {}, "Clear your selected answers and checked status.")}</li>
                  <li>{ui.t("resetDialog.b2", {}, "Clear practice attempts and local state for this quiz.")}</li>
                  <li>
                    {ui.t(
                        "resetDialog.b3",
                        {},
                        "Reload the same question set (it does not generate a new set).",
                    )}
                  </li>
                </ul>
                <div className="ui-quiz-dialog-note">
                  {ui.t("resetDialog.cannotUndo", {}, "This can’t be undone.")}
                </div>
              </div>
            }
            onConfirm={resetThisQuiz}
        />
      </div>
  );
}
