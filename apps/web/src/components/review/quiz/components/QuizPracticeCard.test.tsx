import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import QuizPracticeCard, { flushReviewToolsBeforeSubmit } from "./QuizPracticeCard";

vi.mock("@/i18n/tagged", () => ({
    useTaggedT: () => ({
        t: (_key: string, _params?: unknown, fallback?: string) => fallback ?? "",
        raw: (_key: string, fallback?: string) => fallback ?? "",
    }),
}));

vi.mock("@/components/practice/ExerciseRenderer", () => ({
    default: (props: any) => (
        <div data-testid="exercise-renderer">
            <div data-testid="exercise-id">{props.exercise?.id}</div>
            <div data-testid="current-code">{props.current?.code}</div>
            <div data-testid="code-input-id">{props.codeInputId}</div>
        </div>
    ),
    shouldSkipEmbeddedEnsureExercise: () => false,
}));

vi.mock("@/components/review/module/context/ReviewToolsContext", () => ({
    useOptionalReviewTools: () => ({
        enabled: true,
        registerCodeInput: vi.fn(),
        unregisterCodeInput: vi.fn(),
        isBound: () => false,
        requestBind: vi.fn(),
        ensureVisible: vi.fn(),
        getRunFeedbackEntry: () => null,
        boundId: null,
        setCodeInputMeta: vi.fn(),
    }),
}));

describe("QuizPracticeCard project-step fallback", () => {
    it("awaits the latest tools flush before practice submit", async () => {
        const steps: string[] = [];

        await flushReviewToolsBeforeSubmit({
            flushLatest: async () => {
                steps.push("flush:start");
                await Promise.resolve();
                steps.push("flush:end");
            },
        });

        steps.push("submit");

        expect(steps).toEqual(["flush:start", "flush:end", "submit"]);
    });

    it("renders a project step starter even before a fetched practice item exists", () => {
        const props = {
            q: {
                id: "proj:e2e-reveal-fill-multifile:abc",
                kind: "practice",
                fetch: {
                    subject: "python",
                    module: "e2e-review-clone",
                    section: "e2e-section",
                    topic: "e2e-review-topic",
                    exerciseKey: "e2e-reveal-fill-multifile",
                },
            },
            ownerCardId: "review-clone-reveal-fill-multifile",
            projectStepManifest: {
                id: "e2e-reveal-fill-multifile",
                exerciseKey: "e2e-reveal-fill-multifile",
                title: "Fill answer should create tools/badges.py",
                starterCode:
                    "from tools.names import clean_name\n# TODO: import make_badge from tools.badges\n",
                starterFiles: {
                    "main.py":
                        "from tools.names import clean_name\n# TODO: import make_badge from tools.badges\n",
                    "tools/__init__.py": "",
                    "tools/names.py":
                        "def clean_name(value):\n    return value.strip().title()\n",
                },
                workspace: {
                    language: "python",
                    entryFile: "main.py",
                    starterFiles: {
                        "main.py":
                            "from tools.names import clean_name\n# TODO: import make_badge from tools.badges\n",
                        "tools/__init__.py": "",
                        "tools/names.py":
                            "def clean_name(value):\n    return value.strip().title()\n",
                    },
                },
            },
            ps: {
                loading: true,
                error: null,
                busy: false,
                item: null,
                exercise: null,
                attempts: 0,
                maxAttempts: 3,
            },
            toolsActive: true,
            unlocked: true,
            isCompleted: false,
            locked: false,
            unlimitedAttempts: true,
            strictSequential: false,
            seqOrder: 1,
            padRef: { current: null },
            onUpdateItem: vi.fn(),
            onSubmit: vi.fn(),
            onHelp: vi.fn(),
            onRetryExercise: vi.fn(),
            onExcused: vi.fn(),
        } as any;

        const html = renderToStaticMarkup(
            <QuizPracticeCard {...props} />
        );

        expect(html).toContain('data-testid="exercise-renderer"');
        expect(html).toContain("e2e-reveal-fill-multifile");
        expect(html).toContain("from tools.names import clean_name");
    });
});
