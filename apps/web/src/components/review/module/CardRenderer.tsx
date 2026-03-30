"use client";

import React from "react";
import type { ReviewCard } from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import QuizBlock from "@/components/review/QuizBlock";
import { buildReviewQuizKey } from "@/lib/subjects/quizClient";
import { cn } from "@/lib/cn";

import SketchBlock from "@/components/sketches/subjects/SketchBlock";
import { useTaggedT } from "@/i18n/tagged";

type SavedSketchState = any;

function GateBanner({ text }: { text: string }) {
    return <div className="mt-2 ui-surface-warn p-2 text-xs font-medium">{text}</div>;
}

function CompletedBadge({ text }: { text: string }) {
    return (
        <div className="mt-2">
            <span className="ui-pill-good">{text}</span>
        </div>
    );
}

function CardTitle({ title }: { title?: string | null }) {
    if (!title) return null;
    return <div className="ui-title-sm">{title}</div>;
}

export default function CardRenderer(props: {
    card: ReviewCard;
    cardIndex?: number;

    done: boolean;
    onMarkDone: () => void;

    prereqsMet: boolean;
    locked?: boolean;

    progressHydrated: boolean;

    savedQuiz: SavedQuizState | null;
    versionStr: string;
    onQuizPass: (quizId: string) => void;
    onQuizStateChange: (quizCardId: string, s: SavedQuizState) => void;
    onQuizReset: (quizCardId: string) => void;

    savedSketch: SavedSketchState | null;
    onSketchStateChange: (sketchCardId: string, s: SavedSketchState) => void;
}) {
    const ui = useTaggedT("cardUi");
    const tt = useTaggedT();

    const {
        card,
        cardIndex = 0,
        done,
        onMarkDone,
        prereqsMet,
        locked = false,
        progressHydrated,
        savedQuiz,
        versionStr,
        onQuizPass,
        onQuizStateChange,
        onQuizReset,
        savedSketch,
        onSketchStateChange,
    } = props;

    const wrapCls = "ui-surface-soft rounded-none p-4";

    const actionBtn = done ? "ui-btn-ide-success px-3" : "ui-btn-secondary px-3";

    const orderBase = cardIndex * 10000;
    const cardTitle = tt.resolve(card.title ?? null, {}, card.title ?? "");

    const kindLabel = (kind: "quiz" | "project") =>
        kind === "quiz" ? ui.t("kinds.quiz", {}, "quiz") : ui.t("kinds.project", {}, "project");

    function renderQuizLike(kind: "quiz" | "project") {
        const key = buildReviewQuizKey(card.spec as any, card.id, versionStr);

        const showGate = !done && !prereqsMet;
        const canMountQuizBlock = progressHydrated && (prereqsMet || done);

        const kp = kindLabel(kind);

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

        const completedText = ui.t("completed", {}, "✓ Completed");

        const quizBlockProps =
            kind === "quiz"
                ? {
                    passScore: (card as any).passScore ?? 1.0,
                    sequential: undefined as boolean | undefined,
                    strictSequential: undefined as boolean | undefined,
                    unlimitedAttempts: true,
                }
                : {
                    passScore: 1.0,
                    sequential: true,
                    strictSequential: true,
                    unlimitedAttempts: false,
                };

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
                            spec={card.spec as any}
                            quizKey={key}
                            passScore={quizBlockProps.passScore}
                            prereqsMet={prereqsMet}
                            locked={locked}
                            isCompleted={Boolean(done)}
                            initialState={savedQuiz ?? null}
                            onPass={() => onQuizPass(card.id)}
                            onStateChange={(s: SavedQuizState) => onQuizStateChange(card.id, s)}
                            onReset={() => onQuizReset(card.id)}
                            sequential={quizBlockProps.sequential as any}
                            strictSequential={quizBlockProps.strictSequential as any}
                            unlimitedAttempts={quizBlockProps.unlimitedAttempts}
                            orderBase={orderBase}
                        />
                    )
                ) : null}

                {done ? <CompletedBadge text={completedText} /> : null}
            </div>
        );
    }

    if (card.type === "text") {
        const md = tt.resolve(card.markdown ?? "", {}, card.markdown ?? "");
        const btnText = done ? ui.t("actions.readDone", {}, "✓ Read") : ui.t("actions.read", {}, "Mark as read");

        return (
            <div className={wrapCls}>
                <CardTitle title={cardTitle} />
                <MathMarkdown className="ui-math [&_.katex]:text-inherit" content={md} />
                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={onMarkDone} className={actionBtn} data-flow-focus="1">
                        {btnText}
                    </button>
                </div>
            </div>
        );
    }

    if (card.type === "sketch") {
        return (
            <div>
                <SketchBlock
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
                />
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