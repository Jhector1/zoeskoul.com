"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmResetModal from "../ConfirmResetModal";
import type { PracticeShellProps } from "../PracticeShell";
import PracticeSidebar from "./PracticeSidebar";
import QuestionPanel from "./QuestionPanel";
import type { UseConceptExplainResult } from "../hooks/useConceptExplain";
import PracticeLeaderboardRail from "../leaderboard/PracticeLeaderboardRail";
import { shouldShowPracticeLeaderboard } from "../leaderboard/visibility";
import PracticeMobileActionDock from "./PracticeMobileActionDock";
import PracticeMobileSheet from "./PracticeMobileSheet";
import PracticeMobileHelpPanel from "./PracticeMobileHelpPanel";

type MobileSheet = "controls" | "help" | "leaderboard" | null;

function resultSignature(props: PracticeShellProps) {
  const { current, actionErr } = props;
  if (!current && !actionErr) return null;
  const currentId = (current as any)?.id ?? current?.key ?? "none";
  if (actionErr) return `${currentId}:error:${actionErr}`;
  if (!current?.result) return `${currentId}:pending`;

  return [
    currentId,
    current.attempts ?? 0,
    current.result.ok === true ? "correct" : "incorrect",
    current.result.finalized ? "final" : "open",
    (current.result as any).revealUsed || current.revealed ? "revealed" : "hidden",
  ].join(":");
}

export default function PracticeView(
  props: PracticeShellProps & {
    canSubmitNow: boolean;
    finalized: boolean;
    attempts: number;
    outOfAttempts: boolean;
    resultBoxClass: string;
    concept: UseConceptExplainResult;
  },
) {
  const {
    t,
    confirmOpen,
    applyPendingChange,
    cancelPendingChange,
    answeredCount,
    sessionSize,

    canSubmitNow,
    finalized,
    attempts,
    outOfAttempts,
    resultBoxClass,
    concept,
    experienceMode,
    leaderboardUrl,
    viewer,
    phase,
    current,
    correctCount,
  } = props;

  const [compactViewport, setCompactViewport] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const lastQuestionIdRef = useRef<string | null>(null);
  const lastResultSignatureRef = useRef<string | null>(null);

  const showLeaderboard = Boolean(
    leaderboardUrl && shouldShowPracticeLeaderboard(experienceMode),
  );
  const leaderboardRefreshKey = [
    phase,
    answeredCount,
    correctCount,
    (current as any)?.id ?? current?.key ?? "none",
    current?.result?.ok === true ? "correct" : "pending",
    current?.revealed ? "revealed" : "hidden",
  ].join(":");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const sync = () => {
      setCompactViewport(media.matches);
      if (!media.matches) setMobileSheet(null);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const closeMobileSheet = useCallback(() => setMobileSheet(null), []);
  const openControls = useCallback(() => setMobileSheet("controls"), []);
  const openHelp = useCallback(() => setMobileSheet("help"), []);
  const openLeaderboard = useCallback(() => setMobileSheet("leaderboard"), []);

  const nextResultSignature = useMemo(() => resultSignature(props), [
    props.actionErr,
    props.current,
  ]);

  useEffect(() => {
    if (!compactViewport) return;

    const questionId = (current as any)?.id ?? current?.key ?? null;
    if (lastQuestionIdRef.current !== questionId) {
      lastQuestionIdRef.current = questionId;
      lastResultSignatureRef.current = nextResultSignature;
      setMobileSheet(null);
      return;
    }

    if (
      nextResultSignature &&
      nextResultSignature !== lastResultSignatureRef.current &&
      (current?.result || props.actionErr)
    ) {
      setMobileSheet(
        current?.revealed || (current?.result as any)?.revealUsed
          ? "help"
          : "controls",
      );
    }

    lastResultSignatureRef.current = nextResultSignature;
  }, [compactViewport, current?.key, current?.result, nextResultSignature, props.actionErr]);

  return (
    <div
      className="min-h-screen pb-28 xl:pb-0"
      style={{
        backgroundColor: "rgb(var(--ui-bg) / 1)",
        color: "rgb(var(--ui-text) / 1)",
      }}
    >
      {confirmOpen ? (
        <ConfirmResetModal
          open={confirmOpen}
          title={t("confirm.title")}
          description={`${t("confirm.subtitle")} ${t("confirm.progressLine", {
            answered: answeredCount,
            sessionSize,
          })}`}
          confirmText={t("confirm.restart")}
          cancelText={t("confirm.keep")}
          danger={true}
          onConfirm={applyPendingChange}
          onClose={cancelPendingChange}
        />
      ) : null}

      <div className="mx-auto w-full max-w-[1680px] px-3 py-2 sm:px-5 sm:py-4 lg:px-6 md:py-6">
        <div
          className={[
            "grid min-w-0 gap-4",
            showLeaderboard
              ? "xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(640px,1fr)_260px]"
              : "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]",
          ].join(" ")}
        >
          <div className="hidden min-w-0 xl:col-start-1 xl:row-start-1 xl:block 2xl:sticky 2xl:top-6 2xl:self-start">
            <PracticeSidebar
              {...props}
              canSubmitNow={canSubmitNow}
              finalized={finalized}
              attempts={attempts}
              outOfAttempts={outOfAttempts}
              resultBoxClass={resultBoxClass}
              concept={concept}
            />
          </div>

          <div
            className={
              showLeaderboard
                ? "min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2 2xl:col-start-2 2xl:row-span-1"
                : "min-w-0"
            }
          >
            <QuestionPanel {...props} />
          </div>

          {showLeaderboard && leaderboardUrl ? (
            <div className="hidden min-w-0 xl:col-start-1 xl:row-start-2 xl:block 2xl:sticky 2xl:top-6 2xl:col-start-3 2xl:row-start-1 2xl:self-start">
              <PracticeLeaderboardRail
                leaderboardUrl={leaderboardUrl}
                viewer={viewer}
                experienceMode={experienceMode}
                refreshKey={leaderboardRefreshKey}
              />
            </div>
          ) : null}
        </div>
      </div>

      <PracticeMobileActionDock
        props={props}
        canSubmitNow={canSubmitNow}
        finalized={finalized}
        outOfAttempts={outOfAttempts}
        showLeaderboard={showLeaderboard}
        onOpenControls={openControls}
        onOpenHelp={openHelp}
        onOpenLeaderboard={openLeaderboard}
      />

      {compactViewport ? (
        <>
          <PracticeMobileSheet
            open={mobileSheet === "controls"}
            title={t("mobile.controlsTitle")}
            closeLabel={t("mobile.close")}
            onClose={closeMobileSheet}
          >
            <PracticeSidebar
              {...props}
              compact
              canSubmitNow={canSubmitNow}
              finalized={finalized}
              attempts={attempts}
              outOfAttempts={outOfAttempts}
              resultBoxClass={resultBoxClass}
              concept={concept}
              onOpenHelp={openHelp}
            />
          </PracticeMobileSheet>

          <PracticeMobileSheet
            open={mobileSheet === "help"}
            title={t("mobile.helpTitle")}
            closeLabel={t("mobile.close")}
            onClose={closeMobileSheet}
          >
            <PracticeMobileHelpPanel
              t={t}
              exercise={props.exercise}
              current={props.current}
              helpPolicy={props.helpPolicy}
              allowReveal={props.allowReveal}
              busy={props.busy}
              maxAttempts={props.maxAttempts}
              openHelp={props.openHelp}
              updateCurrent={props.updateCurrent}
              codeInputId={props.codeInputId}
              pendingRevealCompletion={props.pendingRevealCompletion}
              finishRevealedSession={props.finishRevealedSession}
              onClose={closeMobileSheet}
            />
          </PracticeMobileSheet>

          {showLeaderboard && leaderboardUrl ? (
            <PracticeMobileSheet
              open={mobileSheet === "leaderboard"}
              title={t("mobile.leaderboardTitle")}
              closeLabel={t("mobile.close")}
              onClose={closeMobileSheet}
            >
              <PracticeLeaderboardRail
                leaderboardUrl={leaderboardUrl}
                viewer={viewer}
                experienceMode={experienceMode}
                refreshKey={leaderboardRefreshKey}
              />
            </PracticeMobileSheet>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
