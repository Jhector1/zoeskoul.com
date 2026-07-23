"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import {
  GripHorizontal,
  LoaderCircle,
  MessageCircleMore,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import {
  fetchPracticeTutor,
  type PracticeTutorMessage,
} from "@/lib/practice/clientApi";
import { useTaggedT } from "@/i18n/tagged";
import {
  AiTutorAvatar,
  useAiTutorTypewriter,
} from "./AiTutorAvatar";
import {
  buildAiTutorFailureContext,
  buildAiTutorUserAnswer,
  shouldOfferAiTutor,
} from "./tutorContext";
import {
  readAiTutorUnlocked,
  rememberAiTutorUnlocked,
  resolveAiTutorSurface,
} from "./tutorAvailability";

type TutorUiMessage = PracticeTutorMessage & {
  id: string;
  animate?: boolean;
};

let activeTutorOwner: string | null = null;
const tutorOwnerListeners = new Set<() => void>();

function setActiveTutorOwner(owner: string | null) {
  if (activeTutorOwner === owner) return;
  activeTutorOwner = owner;
  for (const listener of tutorOwnerListeners) listener();
}

function subscribeTutorOwner(listener: () => void) {
  tutorOwnerListeners.add(listener);
  return () => tutorOwnerListeners.delete(listener);
}

function getActiveTutorOwner() {
  return activeTutorOwner;
}

function messageId(role: PracticeTutorMessage["role"]) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TutorAssistantMessage({
  message,
  label,
  onReveal,
}: {
  message: TutorUiMessage;
  label: string;
  onReveal: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const rendered = useAiTutorTypewriter(
    message.content,
    8,
    Boolean(message.animate && !reduceMotion),
  );

  useEffect(() => {
    if (!message.animate || reduceMotion) return;
    onReveal();
  }, [message.animate, onReveal, reduceMotion, rendered]);

  return (
    <div className="flex items-start gap-2">
      <AiTutorAvatar size="xs" tone="info" label={label} />
      <div className="ui-tutor-assistant-message min-w-0 flex-1 px-3 py-2 text-sm leading-6">
        <MathMarkdown content={rendered} className="max-w-none" />
      </div>
    </div>
  );
}

export default function AiTutorFloating({
  current,
  exercise,
  enabled = true,
}: {
  current: QItem | null | undefined;
  exercise: Exercise | null | undefined;
  enabled?: boolean;
}) {
  const { t } = useTaggedT("Practice");
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const [mounted, setMounted] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [unlockedExerciseKey, setUnlockedExerciseKey] = useState<
    string | null
  >(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<TutorUiMessage[]>([]);

  const exerciseKey = exercise
    ? `${exercise.topic}:${exercise.id}`
    : current?.key ?? null;
  const thresholdMet = Boolean(
    enabled && exercise && shouldOfferAiTutor(current),
  );
  const rememberedUnlocked = Boolean(
    exerciseKey && unlockedExerciseKey === exerciseKey,
  );
  const canOffer = Boolean(
    enabled && exercise && (thresholdMet || rememberedUnlocked),
  );
  const activeOwner = useSyncExternalStore(
    subscribeTutorOwner,
    getActiveTutorOwner,
    () => null,
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const target = document.querySelector<HTMLElement>(
      '[data-ai-tutor-header-slot="true"]',
    );
    setHeaderTarget(target);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !exerciseKey) return;

    if (thresholdMet) {
      setUnlockedExerciseKey(exerciseKey);
      rememberAiTutorUnlocked(exerciseKey, window.sessionStorage);
      return;
    }

    if (readAiTutorUnlocked(exerciseKey, window.sessionStorage)) {
      setUnlockedExerciseKey(exerciseKey);
    }
  }, [exerciseKey, mounted, thresholdMet]);

  useEffect(() => {
    if (!canOffer || !exerciseKey) {
      if (activeTutorOwner === exerciseKey) setActiveTutorOwner(null);
      return;
    }

    setActiveTutorOwner(exerciseKey);
    return () => {
      if (activeTutorOwner === exerciseKey) setActiveTutorOwner(null);
    };
  }, [canOffer, exerciseKey, current?.attempts]);

  useEffect(() => {
    requestRef.current?.abort();
    setOfferDismissed(false);
    setOpen(false);
    setConsented(false);
    setBusy(false);
    setError(null);
    setDraft("");
    setMessages([]);
  }, [exerciseKey]);

  const keepLatestMessageVisible = useCallback(() => {
    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    keepLatestMessageVisible();
  }, [busy, error, keepLatestMessageVisible, messages, open]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const offerText = t(
    "aiTutor.offer",
    undefined,
    "Two attempts did not pass. I can compare your work with the exercise and explain the mismatch without giving away the answer.",
  );
  const renderedOffer = useAiTutorTypewriter(
    offerText,
    11,
    Boolean(canOffer && !reduceMotion),
  );

  const history = useMemo<PracticeTutorMessage[]>(
    () => messages.map(({ role, content }) => ({ role, content })).slice(-8),
    [messages],
  );

  async function askTutor(message?: string) {
    if (!current || !exercise || busy) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    const trimmed = message?.trim() ?? "";
    if (trimmed) {
      setMessages((items) => [
        ...items,
        { id: messageId("user"), role: "user", content: trimmed },
      ]);
      setDraft("");
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetchPracticeTutor({
        key: current.key,
        userAnswer: buildAiTutorUserAnswer(current, exercise),
        failureContext: buildAiTutorFailureContext(current),
        message: trimmed || undefined,
        history,
        signal: controller.signal,
      });

      const reply = response.reply.trim();
      const previousAssistant = [...history]
        .reverse()
        .find((item) => item.role === "assistant");

      if (previousAssistant?.content.trim() === reply) {
        setError(
          t(
            "aiTutor.repeatError",
            undefined,
            "The tutor did not produce a new explanation. Ask about the specific checker message or the part of your attempt that is confusing.",
          ),
        );
        return;
      }

      setMessages((items) => [
        ...items,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: reply,
          animate: true,
        },
      ]);
    } catch (reason: any) {
      if (reason?.name === "AbortError") return;
      if (reason?.code === "AI_TUTOR_NOT_READY") {
        setOpen(false);
        setConsented(false);
        setOfferDismissed(true);
        return;
      }
      setError(
        reason?.message ??
          t(
            "aiTutor.error",
            undefined,
            "The tutor could not respond right now. Your exercise is still safe.",
          ),
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setBusy(false);
    }
  }

  async function acceptHelp() {
    setConsented(true);
    setOfferDismissed(true);
    setOpen(true);
    await askTutor();
  }

  function collapseTutor() {
    setOpen(false);
    setOfferDismissed(true);
  }

  function reopenTutor() {
    if (consented) {
      setOpen(true);
      return;
    }

    setOfferDismissed(false);
  }

  function submitDraft() {
    if (!draft.trim() || busy) return;
    void askTutor(draft);
  }

  if (
    !mounted ||
    !canOffer ||
    activeOwner !== exerciseKey ||
    !exercise ||
    !current
  ) {
    return null;
  }

  const launcher = (
    <motion.button
      type="button"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={reopenTutor}
      className="ui-tutor-header-launcher"
      aria-label={t("aiTutor.open", undefined, "Open AI tutor")}
      title={t("aiTutor.available", undefined, "AI tutor available")}
    >
      <AiTutorAvatar
        size="xxs"
        tone="info"
        speaking={busy}
        label={t("aiTutor.avatarLabel", undefined, "Tutor")}
      />
      <span className="ui-tutor-header-launcher-dot" aria-hidden="true" />
    </motion.button>
  );

  const launcherPortal = headerTarget
    ? createPortal(launcher, headerTarget)
    : createPortal(
        <div className="pointer-events-none fixed bottom-4 left-4 z-[120]">
          <div className="pointer-events-auto">{launcher}</div>
        </div>,
        document.body,
      );

  const surface = resolveAiTutorSurface({
    available: canOffer,
    open,
    offerDismissed,
  });
  const showFloating = surface === "offer" || surface === "panel";

  return (
    <>
      {surface === "launcher" ? launcherPortal : null}
      {showFloating
        ? createPortal(
    <div
      ref={constraintsRef}
      className="pointer-events-none fixed inset-3 z-[120] sm:inset-4"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.aside
            key="offer"
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={constraintsRef}
            dragElastic={0.05}
            dragMomentum={false}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, x: -18, y: 8, scale: 0.97 }
            }
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, x: -10, scale: 0.98 }
            }
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="ui-tutor-offer pointer-events-auto absolute bottom-0 left-0 flex w-[min(330px,calc(100vw-24px))] items-center gap-2.5 p-2"
          >
            <button
              type="button"
              onPointerDown={(event) => dragControls.start(event)}
              onClick={() => setOpen(consented)}
              className="cursor-grab touch-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-info)/0.32)] active:cursor-grabbing"
              aria-label={t("aiTutor.drag", undefined, "Drag AI tutor")}
            >
              <AiTutorAvatar
                size="xs"
                tone="info"
                speaking
                label={t("aiTutor.avatarLabel", undefined, "Tutor")}
              />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-[1.05rem] text-[rgb(var(--ui-text-muted)/0.92)]">
                {renderedOffer}
                {renderedOffer.length < offerText.length ? (
                  <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[rgb(var(--ui-info)/0.72)] align-middle" />
                ) : null}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (consented) setOpen(true);
                    else void acceptHelp();
                  }}
                  className="ui-btn-info h-7 px-2.5 text-[11px]"
                >
                  {consented
                    ? t("aiTutor.continue", undefined, "Continue chat")
                    : t("aiTutor.accept", undefined, "Help me")}
                </button>
                <button
                  type="button"
                  onClick={collapseTutor}
                  className="ui-btn-ide-ghost h-7 px-2 text-[11px]"
                >
                  {t("aiTutor.notNow", undefined, "Not now")}
                </button>
              </div>
            </div>

            <GripHorizontal
              className="size-3.5 shrink-0 self-start text-[rgb(var(--ui-info)/0.5)]"
              aria-hidden="true"
            />
          </motion.aside>
        ) : (
          <motion.aside
            key="panel"
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={constraintsRef}
            dragElastic={0.04}
            dragMomentum={false}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, x: -16, y: 10, scale: 0.98 }
            }
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="ui-tutor-panel pointer-events-auto absolute bottom-0 left-0 flex max-h-[min(540px,calc(100vh-32px))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden"
          >
            <div
              onPointerDown={(event) => dragControls.start(event)}
              className="ui-tutor-header flex cursor-grab touch-none items-center gap-2 px-3 py-2 active:cursor-grabbing"
            >
              <AiTutorAvatar
                size="xs"
                tone="info"
                speaking={busy}
                label={t("aiTutor.avatarLabel", undefined, "Tutor")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-3.5 text-[rgb(var(--ui-info)/1)]" />
                  {t("aiTutor.title", undefined, "AI tutor")}
                </div>
                <div className="truncate text-[11px] text-[rgb(var(--ui-text-muted)/0.82)]">
                  {t(
                    "aiTutor.subtitle",
                    undefined,
                    "Compares your attempt with the exercise and explains the mismatch",
                  )}
                </div>
              </div>
              <GripHorizontal
                className="size-4 shrink-0 text-[rgb(var(--ui-info)/0.5)]"
                aria-hidden="true"
              />
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={collapseTutor}
                className="ui-btn-ide-ghost flex size-8 items-center justify-center p-0"
                aria-label={t("aiTutor.minimize", undefined, "Minimize tutor")}
              >
                <MessageCircleMore className="size-4" />
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={collapseTutor}
                className="ui-btn-ide-ghost flex size-8 items-center justify-center p-0"
                aria-label={t("aiTutor.close", undefined, "Close chat")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
            >
              {messages.map((message) =>
                message.role === "assistant" ? (
                  <TutorAssistantMessage
                    key={message.id}
                    message={message}
                    label={t("aiTutor.avatarLabel", undefined, "Tutor")}
                    onReveal={keepLatestMessageVisible}
                  />
                ) : (
                  <div key={message.id} className="flex justify-end">
                    <div className="ui-tutor-user-message max-w-[84%] px-3 py-2 text-sm leading-6">
                      {message.content}
                    </div>
                  </div>
                ),
              )}

              {busy ? (
                <div className="flex items-center gap-2 text-xs text-[rgb(var(--ui-text-muted)/0.86)]">
                  <LoaderCircle className="size-4 animate-spin text-[rgb(var(--ui-info)/1)]" />
                  {t("aiTutor.thinking", undefined, "Looking at your attempts…")}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-[rgb(var(--ui-danger)/0.25)] bg-[rgb(var(--ui-danger)/0.08)] px-3 py-2 text-xs text-[rgb(var(--ui-danger)/0.95)]">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="ui-tutor-composer p-3">
              <div className="mb-2 text-[10px] leading-4 text-[rgb(var(--ui-text-muted)/0.72)]">
                {t(
                  "aiTutor.guardrail",
                  undefined,
                  "Ask about the feedback or concept. The tutor will guide you without giving the final answer.",
                )}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 1200))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitDraft();
                    }
                  }}
                  rows={2}
                  disabled={busy}
                  placeholder={t(
                    "aiTutor.placeholder",
                    undefined,
                    "Ask what the feedback means…",
                  )}
                  className="ui-tutor-input min-h-11 flex-1 resize-none px-3 py-2 text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={submitDraft}
                  disabled={busy || !draft.trim()}
                  className="ui-btn-info flex size-11 shrink-0 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("aiTutor.send", undefined, "Send message")}
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>,
            document.body,
          )
        : null}
    </>
  );
}
