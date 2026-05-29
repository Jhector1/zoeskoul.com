import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewCard } from "@/lib/subjects/types";

import { buildQuizBlockRuntimeDefaultsProps } from "./runtime/cardRuntimeDefaults";
import CardRenderer from "./CardRenderer";

const mocked = vi.hoisted(() => ({
    quizBlockProps: [] as Array<Record<string, unknown>>,
    sketchBlockProps: [] as Array<Record<string, unknown>>,
    ensureCard: vi.fn(),
}));

vi.mock("@/components/review/QuizBlock", () => ({
    default: (props: Record<string, unknown>) => {
        mocked.quizBlockProps.push(props);
        return null;
    },
}));

vi.mock("@/components/markdown/MathMarkdown", () => ({
    default: () => null,
}));

vi.mock("@/components/sketches/subjects/SketchBlock", () => ({
    default: (props: Record<string, unknown>) => {
        mocked.sketchBlockProps.push(props);
        return null;
    },
}));

vi.mock("@/i18n/tagged", () => ({
    useTaggedT: () => ({
        t: (_key: string, _vars: Record<string, unknown>, fallback: string) => fallback,
        resolve: (value: string | null | undefined, _vars: Record<string, unknown>, fallback: string) =>
            value ?? fallback,
    }),
}));

vi.mock("@/components/review/module/runtime/reviewRuntimeStore", () => ({
    useReviewRuntimeStore: (selector: (state: { ensureCard: typeof mocked.ensureCard }) => unknown) =>
        selector({ ensureCard: mocked.ensureCard }),
}));

function baseProps(card: ReviewCard) {
    return {
        card,
        done: false,
        onMarkDone: vi.fn(),
        prereqsMet: true,
        locked: false,
        progressHydrated: true,
        savedQuiz: null,
        versionStr: "v1",
        onQuizPass: vi.fn(),
        onQuizStateChange: vi.fn(),
        onQuizReset: vi.fn(),
        savedSketch: null,
        quizNavMode: "scroll" as const,
        onSketchStateChange: vi.fn(),
        cardKey: `${card.id}:key`,
        topicId: "topic-1",
        tp: {},
    };
}

function projectCard(
    overrides: Partial<Extract<ReviewCard, { type: "project" }>> = {},
): Extract<ReviewCard, { type: "project" }> {
    return {
        type: "project",
        id: overrides.id ?? "project-card",
        title: overrides.title ?? "Project card",
        spec: overrides.spec ?? {
            mode: "project",
            subject: "python-v2",
            moduleSlug: "module-1",
            steps: [{ id: "step-1", topic: "python-v2.topic-1" }],
        },
        ...("tryIt" in overrides ? { tryIt: overrides.tryIt } : {}),
    };
}

function quizCard(): Extract<ReviewCard, { type: "quiz" }> {
    return {
        type: "quiz",
        id: "quiz-card",
        title: "Quiz card",
        spec: {
            subject: "python-v2",
            moduleSlug: "module-1",
        },
    };
}

function textCard(
    overrides: Partial<Extract<ReviewCard, { type: "text" }>> = {},
): Extract<ReviewCard, { type: "text" }> {
    return {
        type: "text",
        id: overrides.id ?? "text-card",
        title: overrides.title ?? "Text card",
        markdown: overrides.markdown ?? "Hello",
        ...("tryIt" in overrides ? { tryIt: overrides.tryIt } : {}),
    };
}

function sketchCard(
    overrides: Partial<Extract<ReviewCard, { type: "sketch" }>> = {},
): Extract<ReviewCard, { type: "sketch" }> {
    return {
        type: "sketch",
        id: overrides.id ?? "sketch-card",
        title: overrides.title ?? "Sketch card",
        sketchId: overrides.sketchId ?? "sketch-1",
        ...("tryIt" in overrides ? { tryIt: overrides.tryIt } : {}),
    };
}

function embeddedTryIt(id = "try-append-ten-to-list") {
    return {
        id,
        title: "Embedded Try It",
        prompt: "Write the code",
        exerciseKey: "try-append-ten-to-list",
        difficulty: "easy" as const,
        preferKind: "code_input" as const,
        seedPolicy: "global" as const,
        required: true,
        allowReveal: false,
        spec: {
            mode: "project" as const,
            subject: "python-data-functions",
            moduleSlug: "module-5",
            section: "section-1",
            topic: "py5.list-methods-and-mutation",
            difficulty: "easy" as const,
            preferKind: "code_input" as const,
            allowReveal: false,
            maxAttempts: null,
            steps: [
                {
                    id: "try_append_ten_to_list",
                    exerciseKey: "try-append-ten-to-list",
                    difficulty: "easy" as const,
                    preferKind: "code_input" as const,
                    seedPolicy: "global" as const,
                },
            ],
            runtime: null,
            tryIt: true,
            uiKind: "try_it",
            displayKind: "try_it",
        },
    };
}

describe("buildQuizBlockRuntimeDefaultsProps", () => {
    it("forwards module runtime defaults into the quiz render path", () => {
        const runtimeDefaults = {
            kind: "sql",
            datasetId: "students_intro",
            showErd: true,
            showChen: true,
        };

        expect(
            buildQuizBlockRuntimeDefaultsProps({
                moduleRuntimeDefaults: runtimeDefaults,
            }),
        ).toMatchObject({
            moduleRuntimeDefaults: runtimeDefaults,
            topicRuntimeDefaults: null,
        });
    });
});

describe("CardRenderer try it handling", () => {
    beforeEach(() => {
        mocked.quizBlockProps.length = 0;
        mocked.sketchBlockProps.length = 0;
        mocked.ensureCard.mockClear();
    });

    it("passes unlimited attempts for try it, keeps normal project limited, and keeps quiz unlimited", () => {
        renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                baseProps(projectCard({ id: "try-write-mode-basics" })),
            ),
        );

        renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                baseProps(projectCard({ id: "write-mode-basics" })),
            ),
        );

        renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                baseProps(quizCard()),
            ),
        );

        expect(mocked.quizBlockProps).toHaveLength(3);
        expect(mocked.quizBlockProps[0]?.unlimitedAttempts).toBe(true);
        expect(mocked.quizBlockProps[1]?.unlimitedAttempts).toBe(false);
        expect(mocked.quizBlockProps[2]?.unlimitedAttempts).toBe(true);
    });

    it("uses try-it copy for detected try projects and keeps project copy for normal projects", () => {
        const tryGateHtml = renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                {
                    ...baseProps(projectCard({ id: "try-write-mode-basics" })),
                    prereqsMet: false,
                },
            ),
        );

        const tryLoadingHtml = renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                {
                    ...baseProps(projectCard({ id: "try-write-mode-basics" })),
                    progressHydrated: false,
                },
            ),
        );

        const projectGateHtml = renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                {
                    ...baseProps(projectCard({ id: "write-mode-basics" })),
                    prereqsMet: false,
                },
            ),
        );

        expect(tryGateHtml).toContain("try it yourself task");
        expect(tryLoadingHtml).toContain("Loading saved try it yourself task state");
        expect(projectGateHtml).toContain("unlock this project");
        expect(projectGateHtml).not.toContain("try it yourself task");
    });

    it("renders embedded try it inside a text card, disables Mark as done before pass, and stores state under the tryIt id", () => {
        const html = renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                {
                    ...baseProps(textCard({ tryIt: embeddedTryIt() })),
                    tp: {},
                },
            ),
        );

        expect(html).toContain("Embedded Try It");
        expect(html).toContain("Mark as done");
        expect(html).toContain("disabled");
        expect(mocked.quizBlockProps.at(-1)?.quizCardId).toBe("text-card");
        expect(mocked.quizBlockProps.at(-1)?.quizCardId).toBe("text-card");    });

    it("mounts embedded try it through QuizBlock and unlocks the text button after pass", () => {
        const onEmbeddedTryItPass = vi.fn();
        const onQuizStateChange = vi.fn();
        const onQuizReset = vi.fn();

        const html = renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                {
                    ...baseProps(textCard({ tryIt: embeddedTryIt() })),
                    progressHydrated: true,
                    tp: {
                        quizState: {
                            "try-append-ten-to-list": {
                                answers: {},
                                checkedById: {},
                            },
                        },
                        quizzesDone: {
                            "try-append-ten-to-list": true,
                        },
                    },
                    onEmbeddedTryItPass,
                    onQuizStateChange,
                    onQuizReset,
                },
            ),
        );

        expect(html).not.toContain("disabled");
        expect(html).toContain("Mark as done");
        expect(mocked.quizBlockProps.at(-1)?.quizId).toBe("try-append-ten-to-list");
        expect(mocked.quizBlockProps.at(-1)?.quizCardId).toBe("text-card");
        expect(mocked.quizBlockProps.at(-1)?.unlimitedAttempts).toBe(true);
        expect(mocked.quizBlockProps.at(-1)?.isCompleted).toBe(true);

        (mocked.quizBlockProps.at(-1)?.onPass as (() => void) | undefined)?.();
        expect(onEmbeddedTryItPass).toHaveBeenCalledWith("try-append-ten-to-list");
    });

    it("passes mark-done disabling props into SketchBlock when embedded try it is required and incomplete", () => {
        renderToStaticMarkup(
            React.createElement(
                CardRenderer,
                baseProps(sketchCard({ tryIt: embeddedTryIt() })),
            ),
        );

        expect(mocked.sketchBlockProps).toHaveLength(1);
        expect(mocked.sketchBlockProps[0]?.markDoneDisabled).toBe(true);
        expect(String(mocked.sketchBlockProps[0]?.markDoneDisabledReason)).toContain("mark this lesson as done");
        expect(mocked.sketchBlockProps[0]?.markDoneLabel).toBe("Mark as done");
        expect(mocked.sketchBlockProps[0]?.markDoneDoneLabel).toBe("✓ Done");
        expect(mocked.quizBlockProps.at(-1)?.quizId).toBe("try-append-ten-to-list");
    });
});
