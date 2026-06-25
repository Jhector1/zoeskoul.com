"use client";

import React from "react";
import type { ReviewCard, ReviewEmbeddedTryIt } from "@/lib/subjects/types";
import type {
    ReviewTopicProgress,
    SavedQuizState,
} from "@/lib/subjects/progressTypes";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import QuizBlock from "@/components/review/QuizBlock";
import { buildReviewQuizKey } from "@/lib/subjects/quizClient";

import SketchBlock from "@/components/sketches/subjects/SketchBlock";
import type { SavedSketchState } from "@/components/sketches/subjects/types";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { FlowNavMode } from "@/components/review/navigation/FlowNavigator";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { buildQuizBlockRuntimeDefaultsProps } from "@/components/review/module/runtime/cardRuntimeDefaults";
import {
    getAssessmentDisplayKind,
    type AssessmentDisplayKind,
} from "@/components/review/module/tryItProjectCard";
type ReviewCardSpecRecord = Record<string, unknown> | null | undefined;

function GateBanner({ text }: { text: string }) {
    return <div className="mt-2 ui-surface-warn p-2 text-xs font-medium">{text}</div>;
}

function CardTitle({ title }: { title?: string | null }) {
    if (!title) return null;
    return <div className="ui-title-sm">{title}</div>;
}

export default function CardRenderer(props: {
    card: ReviewCard;
    active?: boolean;
    cardIndex?: number;

    done: boolean;
    onMarkDone: () => void;
    onEmbeddedTryItPass?: (tryItId: string) => void;

    prereqsMet: boolean;
    locked?: boolean;

    progressHydrated: boolean;

    savedQuiz: SavedQuizState | null;
    versionStr: string;
    onQuizPass: (quizId: string) => void;
    onQuizStateChange: (quizCardId: string, s: SavedQuizState) => void;
    onQuizReset: (quizCardId: string) => void;

    savedSketch: SavedSketchState | null;
    quizNavMode?: FlowNavMode;
    onSketchStateChange: (sketchCardId: string, s: SavedSketchState) => void;

    onRun?: () => void;
    onReveal?: () => void;
    onSubmit?: () => void;

    cardKey: string;
    topicId: string;
    tp: ReviewTopicProgress;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
    routeExerciseId?: string | null;
    defaultToolLanguage?: string;
    onNavigateToExerciseRoute?: (args: { cardId: string; exerciseId: string }) => Promise<void> | void;
}) {
    const ui = useTaggedT("cardUi");
    const tt = useTaggedT();

    const {
        card,
        active = true,
        cardIndex = 0,
        done,
        onMarkDone,
        onEmbeddedTryItPass,
        prereqsMet,
        locked = false,
        progressHydrated,
        savedQuiz,
        versionStr,
        onQuizPass,
        onQuizStateChange,
        onQuizReset,
        savedSketch,
        quizNavMode = "scroll",
        onSketchStateChange,
        cardKey,
        topicId,
        tp,
        subjectRuntimeDefaults,
        courseRuntimeDefaults,
        moduleRuntimeDefaults,
        sectionRuntimeDefaults,
        topicRuntimeDefaults,
        routeExerciseId,
        defaultToolLanguage = "python",
        onNavigateToExerciseRoute,
    } = props;

    const ensureCard = useReviewRuntimeStore((s) => s.ensureCard);

    React.useEffect(() => {
        const cardSpec = ("spec" in card ? card.spec : null) as ReviewCardSpecRecord;
        const specRuntime = cardSpec && typeof cardSpec === "object"
            ? (cardSpec.runtime as Record<string, unknown> | undefined)
            : undefined;
        const specWorkspace = cardSpec && typeof cardSpec === "object"
            ? cardSpec.workspace
            : null;

        if (progressHydrated) {
            ensureCard({
                cardKey,
                topicId,
                cardId: card.id,
                initial: {
                    sketch: tp?.sketchState?.[card.id] || null,
                },
                toolLanguage:
                    specRuntime?.kind === "sql" ? "sql" : defaultToolLanguage,
                toolManifest: {
                    workspace: specWorkspace ?? null,
                },
                toolKey: `${cardKey}:general`,
            });
        }
    }, [progressHydrated, cardKey, topicId, card.id, tp, ensureCard, card, defaultToolLanguage]);

    const wrapCls = "ui-surface-muted rounded-none p-4";

    const actionBtn = done ? "ui-btn-ide-success px-3" : "ui-btn-secondary px-3";

    const orderBase = cardIndex * 10000;
    const cardTitle = tt.resolve(card.title ?? null, {}, card.title ?? "");

    const kindLabel = (kind: AssessmentDisplayKind) => {
        if (kind === "quiz") return ui.t("kinds.quiz", {}, "quiz");
        if (kind === "tryIt") return ui.t("kinds.tryIt", {}, "try it yourself task");
        return ui.t("kinds.project", {}, "project");
    };
    const tryItButtonCopy = (tryItRequired: boolean) => {
        if (!tryItRequired) {
            return {
                buttonText: done
                    ? ui.t("actions.readDone", {}, "✓ Read")
                    : ui.t("actions.read", {}, "Mark as read"),
                disabledReason: "Complete the Try it yourself task to mark this lesson as read.",
                title: ui.t("actions.readTitle", {}, "Mark this lesson as read"),
            };
        }

        return {
            buttonText: done
                ? ui.t("actions.doneDone", {}, "✓ Done")
                : ui.t("actions.done", {}, "Mark as done"),
            disabledReason: "Complete the Try it yourself task to mark this lesson as done.",
            title: ui.t("actions.doneTitle", {}, "Mark this lesson as done"),
        };
    };

    function getCardTryIt(nextCard: ReviewCard): ReviewEmbeddedTryIt | null {
        const value = (nextCard as { tryIt?: unknown }).tryIt;
        if (!value || typeof value !== "object") return null;

        const record = value as Record<string, unknown>;
        if (typeof record.id !== "string" || !record.id.trim()) return null;
        if (!record.spec || typeof record.spec !== "object") return null;

        return value as ReviewEmbeddedTryIt;
    }

    function renderEmbeddedTryIt() {
        const tryIt = getCardTryIt(card);
        if (!tryIt) return null;

        const tryItId = tryIt.id;
        const tryItDone = Boolean(tp?.quizzesDone?.[tryItId]);
        const savedTryIt = (tp?.quizState?.[tryItId] ?? null) as SavedQuizState | null;

        const title = tt.resolve(
            tryIt.title ?? null,
            {},
            tryIt.title ?? "Try it yourself",
        );

        const resolvedTryItSpec = resolveDeepTagged(
            tryIt.spec,
            (key) => tt.resolve(`@:${key}`),
        ) as typeof tryIt.spec;

        const key = buildReviewQuizKey(resolvedTryItSpec, tryItId, versionStr);

        const runtimeDefaultsProps = buildQuizBlockRuntimeDefaultsProps({
            subjectRuntimeDefaults,
            courseRuntimeDefaults,
            moduleRuntimeDefaults,
            sectionRuntimeDefaults,
            topicRuntimeDefaults,
        });

        return (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-400/20 dark:bg-emerald-950/20">
                <div className="ui-title-sm">{title || "Try it yourself"}</div>

                {process.env.NODE_ENV !== "production" ? (
                    <textarea
                        data-testid="cardrenderer-tryit-spec-e2e-input"
                        aria-label="E2E resolved embedded Try It spec"
                        readOnly
                        value={JSON.stringify({
                            tryItId,
                            quizKey: key,
                            spec: resolvedTryItSpec,
                            firstStep: (resolvedTryItSpec as any)?.steps?.[0] ?? null,
                        })}
                        style={{
                            position: "absolute",
                            width: 1,
                            height: 1,
                            opacity: 0,
                            pointerEvents: "none",
                        }}
                    />
                ) : null}

                {!progressHydrated ? (
                    <div className="mt-2 ui-meta">
                        Loading saved try it yourself state…
                    </div>
                ) : (
                    <QuizBlock
                        key={key}
                        quizId={tryItId}
                        quizCardId={card.id}
                        toolsActive={active}
                        spec={resolvedTryItSpec}
                        quizKey={key}
                        passScore={1.0}
                        prereqsMet={prereqsMet}
                        locked={locked}
                        isCompleted={tryItDone}
                        initialState={savedTryIt}
                        onPass={() => onEmbeddedTryItPass?.(tryItId)}
                        onStateChange={(s: SavedQuizState) => onQuizStateChange(tryItId, s)}
                        onReset={() => onQuizReset(tryItId)}
                        sequential={true}
                        strictSequential={true}
                        unlimitedAttempts={true}
                        orderBase={orderBase + 5000}
                        navigationMode={quizNavMode}
                        {...runtimeDefaultsProps}
                        routeExerciseId={routeExerciseId}
                        onNavigateToExerciseRoute={onNavigateToExerciseRoute}
                    />
                )}
            </div>
        );
    }
    function renderQuizLike(kind: "quiz" | "project") {
        const quizCard = card as Extract<ReviewCard, { type: "quiz" | "project" }>;
        const key = buildReviewQuizKey(card.spec, card.id, versionStr);
        const displayKind = getAssessmentDisplayKind(card, kind);

        const showGate = !done && !prereqsMet;
        const canMountQuizBlock = progressHydrated && (prereqsMet || done);

        const kp = kindLabel(displayKind);

        const gateText = ui.t(
            "gateBanner",
            { kind: kp },
            `Complete the topic items above to unlock this ${kp}.`,
        );

        const loadingSavedText = ui.t(
            "loadingSaved",
            { kind: kp },
            `Loading saved ${kp} state…`,
        );

        const quizBlockProps =
            kind === "quiz"
                ? {
                    passScore: quizCard.passScore ?? 1.0,
                    sequential: undefined as boolean | undefined,
                    strictSequential: undefined as boolean | undefined,
                    unlimitedAttempts: true,
                }
                : displayKind === "tryIt"
                    ? {
                        passScore: 1.0,
                        sequential: true,
                        strictSequential: true,
                        unlimitedAttempts: true,
                    }
                    : {
                        passScore: 1.0,
                        sequential: true,
                        strictSequential: true,
                        unlimitedAttempts: false,
                    };
        const runtimeDefaultsProps = buildQuizBlockRuntimeDefaultsProps({
            subjectRuntimeDefaults,
            courseRuntimeDefaults,
            moduleRuntimeDefaults,
            sectionRuntimeDefaults,
            topicRuntimeDefaults,
        });

        return (
            <div className={wrapCls}>
                <CardTitle title={cardTitle} />

                {showGate ? <GateBanner text={gateText} /> : null}

                {!showGate ? (
                    !canMountQuizBlock ? (
                        <div className="mt-2 ui-meta">{loadingSavedText}</div>
                    ) : (
                        <QuizBlock
                            key={key}
                            quizId={card.id}
                            quizCardId={card.id}
                            toolsActive={active}
                            spec={quizCard.spec}
                            quizKey={key}
                            passScore={quizBlockProps.passScore}
                            prereqsMet={prereqsMet}
                            locked={locked}
                            isCompleted={Boolean(done)}
                            initialState={savedQuiz ?? null}
                            onPass={() => onQuizPass(card.id)}
                            onStateChange={(s: SavedQuizState) => onQuizStateChange(card.id, s)}
                            onReset={() => onQuizReset(card.id)}
                            sequential={quizBlockProps.sequential}
                            strictSequential={quizBlockProps.strictSequential}
                            unlimitedAttempts={quizBlockProps.unlimitedAttempts}
                            orderBase={orderBase}
                            navigationMode={quizNavMode}
                            {...runtimeDefaultsProps}
                            routeExerciseId={routeExerciseId}
                            onNavigateToExerciseRoute={onNavigateToExerciseRoute}
                        />
                    )
                ) : null}

                {/*{done ? <CompletedBadge text={completedText} /> : null}*/}
            </div>
        );
    }

    if (card.type === "text") {
        const md = tt.resolve(card.markdown ?? "", {}, card.markdown ?? "");
        const tryIt = getCardTryIt(card);
        const tryItRequired = Boolean(tryIt && tryIt.required !== false);
        const tryItDone = tryIt ? Boolean(tp?.quizzesDone?.[tryIt.id]) : true;
        const markReadDisabled = tryItRequired && !tryItDone;
        const tryItCopy = tryItButtonCopy(tryItRequired);

        return (
            <div className={wrapCls}>
                <CardTitle title={cardTitle} />
                <MathMarkdown className="ui-math [&_.katex]:text-inherit" content={md} />
                {renderEmbeddedTryIt()}
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={onMarkDone}
                        className={actionBtn}
                        disabled={markReadDisabled}
                        title={
                            markReadDisabled
                                ? tryItCopy.disabledReason
                                : undefined
                        }
                        data-flow-focus="1"
                    >
                        {tryItCopy.buttonText}
                    </button>
                </div>
            </div>
        );
    }

    if (card.type === "sketch") {
        const tryIt = getCardTryIt(card);
        const tryItRequired = Boolean(tryIt && tryIt.required !== false);
        const tryItDone = tryIt ? Boolean(tp?.quizzesDone?.[tryIt.id]) : true;
        const markReadDisabled = tryItRequired && !tryItDone;
        const tryItCopy = tryItButtonCopy(tryItRequired);

        return (
            <div>
                <SketchBlock
                    key={cardKey}
                    stateKey={cardKey}
                    cardId={card.id}
                    title={card.title}
                    sketchId={card.sketchId}
                    height={card.height}
                    propsPatch={card.props}
                    initialState={savedSketch}
                    onStateChange={(s) => onSketchStateChange(card.id, s)}
                    done={done}
                    onMarkDone={onMarkDone}
                    prereqsMet={prereqsMet}
                    locked={locked}
                    markDoneDisabled={markReadDisabled}
                    markDoneDisabledReason={tryItCopy.disabledReason}
                    markDoneLabel={tryItRequired ? ui.t("actions.done", {}, "Mark as done") : undefined}
                    markDoneDoneLabel={tryItRequired ? ui.t("actions.doneDone", {}, "✓ Done") : undefined}
                    markDoneTitle={tryItRequired ? tryItCopy.title : undefined}
                />
                {renderEmbeddedTryIt()}
            </div>
        );
    }

    if (card.type === "video") {
        const provider = card.provider ?? "auto";
        const url = card.url;

        const isFile = /\.(mp4|webm|mov)(\?|#|$)/i.test(url) || provider === "file";

        const caption = tt.resolve(card.captionMarkdown ?? "", {}, card.captionMarkdown ?? "");

        const btnText = done
            ? ui.t("actions.watchedDone", {}, "✓ Watched")
            : ui.t("actions.watched", {}, "Mark watched");

        return (
            <div className={wrapCls}>
                <CardTitle title={cardTitle} />

                <div className="mt-3 ui-surface-muted p-3">
                    {isFile ? (
                        <video className="w-full rounded-xl" controls preload="metadata" poster={card.posterUrl}>
                            <source src={url} />
                        </video>
                    ) : (
                        <iframe
                            className="w-full rounded-xl"
                            style={{ height: 380 }}
                            src={url}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}

                    {caption ? (
                        <div className="mt-3">
                            <MathMarkdown className="ui-math [&_.katex]:text-inherit" content={caption} />
                        </div>
                    ) : null}
                </div>

                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={onMarkDone} className={actionBtn} data-flow-focus="1">
                        {btnText}
                    </button>
                </div>
            </div>
        );
    }

    if (card.type === "quiz") return renderQuizLike("quiz");
    if (card.type === "project") return renderQuizLike("project");

    return null;
}
