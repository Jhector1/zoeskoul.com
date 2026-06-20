import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuizPracticeCard, { flushReviewToolsBeforeSubmit } from "./QuizPracticeCard";

const mocked = vi.hoisted(() => ({
    exerciseRendererProps: [] as any[],
    registerCodeInput: vi.fn(),
    unregisterCodeInput: vi.fn(),
    requestBind: vi.fn(),
    ensureVisible: vi.fn(),
    setCodeInputMeta: vi.fn(),
}));

vi.mock("@/i18n/tagged", () => ({
    useTaggedT: () => ({
        t: (_key: string, _params?: unknown, fallback?: string) => fallback ?? "",
        raw: (_key: string, fallback?: string) => fallback ?? "",
    }),
    isTaggedKey: () => false,
    stripTag: (value: string) => value,
}));

vi.mock("@/components/practice/ExerciseRenderer", () => ({
    default: (props: any) => (
        <div data-testid="exercise-renderer">
            {mocked.exerciseRendererProps.push(props) as any}
            <div data-testid="exercise-id">{props.exercise?.id}</div>
            <div data-testid="current-code">{props.current?.code}</div>
            <div data-testid="code-input-id">{props.codeInputId}</div>
            <div data-testid="code-runner-mode">{props.codeRunnerMode}</div>
        </div>
    ),
    shouldSkipEmbeddedEnsureExercise: () => false,
}));

vi.mock("@/components/review/module/context/ReviewToolsContext", () => ({
    useOptionalReviewTools: () => ({
        enabled: true,
        registerCodeInput: mocked.registerCodeInput,
        unregisterCodeInput: mocked.unregisterCodeInput,
        isBound: () => false,
        requestBind: mocked.requestBind,
        ensureVisible: mocked.ensureVisible,
        getRunFeedbackEntry: () => null,
        boundId: null,
        setCodeInputMeta: mocked.setCodeInputMeta,
    }),
}));

describe("QuizPracticeCard project-step fallback", () => {
    beforeEach(() => {
        mocked.exerciseRendererProps.length = 0;
        mocked.registerCodeInput.mockClear();
        mocked.unregisterCodeInput.mockClear();
        mocked.requestBind.mockClear();
        mocked.ensureVisible.mockClear();
        mocked.setCodeInputMeta.mockClear();
    });

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

        expect(steps).toEqual(["flush:start", "flush:end", "flush:start", "flush:end", "submit"]);
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

    it("routes file-based Python exercises through Tools", () => {
        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-tools",
                    kind: "practice",
                    fetch: {
                        subject: "python",
                        module: "module-1",
                        section: "section-1",
                        topic: "topic-1",
                    },
                } as any}
                ownerCardId="card-1"
                ps={{
                    loading: false,
                    error: null,
                    busy: false,
                    item: {
                        code: "print('hi')",
                        exercise: {
                            id: "workspace-ex",
                            kind: "code_input",
                            topic: "topic-1",
                            difficulty: "easy",
                            title: "Workspace exercise",
                            prompt: "Edit files",
                            language: "python",
                            starterFiles: {
                                "main.py": "print('hi')",
                                "note.txt": "remember me",
                            },
                        },
                    },
                    exercise: {
                        id: "workspace-ex",
                        kind: "code_input",
                        topic: "topic-1",
                        difficulty: "easy",
                        title: "Workspace exercise",
                        prompt: "Edit files",
                        language: "python",
                        starterFiles: {
                            "main.py": "print('hi')",
                            "note.txt": "remember me",
                        },
                    },
                    attempts: 0,
                    maxAttempts: 3,
                }}
                toolsActive
                unlocked
                isCompleted={false}
                locked={false}
                unlimitedAttempts
                strictSequential={false}
                seqOrder={1}
                padRef={{ current: null } as any}
                onUpdateItem={vi.fn()}
                onSubmit={vi.fn()}
                onHelp={vi.fn()}
                onRetryExercise={vi.fn()}
                onExcused={vi.fn()}
            />,
        );

        const props = mocked.exerciseRendererProps.at(-1);
        expect(props?.codeRunnerMode).toBe("tools");
        expect(props?.codeTools).toBeTruthy();
    });

    it("defaults simple code_input exercises to the tools workspace", () => {
        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-default-tools",
                    kind: "practice",
                    fetch: {
                        subject: "python",
                        module: "module-1",
                        section: "section-1",
                        topic: "topic-1",
                    },
                } as any}
                ownerCardId="card-1"
                ps={{
                    loading: false,
                    error: null,
                    busy: false,
                    item: {
                        code: "print('hi')",
                        exercise: {
                            id: "default-tools-ex",
                            kind: "code_input",
                            topic: "topic-1",
                            difficulty: "easy",
                            title: "Default tools exercise",
                            prompt: "Type one line",
                            language: "python",
                            starterCode: "print('hi')",
                        },
                    },
                    exercise: {
                        id: "default-tools-ex",
                        kind: "code_input",
                        topic: "topic-1",
                        difficulty: "easy",
                        title: "Default tools exercise",
                        prompt: "Type one line",
                        language: "python",
                        starterCode: "print('hi')",
                    },
                    attempts: 0,
                    maxAttempts: 3,
                }}
                toolsActive
                unlocked
                isCompleted={false}
                locked={false}
                unlimitedAttempts
                strictSequential={false}
                seqOrder={1}
                padRef={{ current: null } as any}
                onUpdateItem={vi.fn()}
                onSubmit={vi.fn()}
                onHelp={vi.fn()}
                onRetryExercise={vi.fn()}
                onExcused={vi.fn()}
            />,
        );

        const props = mocked.exerciseRendererProps.at(-1);
        expect(props?.codeRunnerMode).toBe("tools");
        expect(props?.codeTools).toBeTruthy();
    });

    it("keeps simple inline code_input exercises embedded when the manifest opts in", () => {
        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-inline",
                    kind: "practice",
                    fetch: {
                        subject: "python",
                        module: "module-1",
                        section: "section-1",
                        topic: "topic-1",
                    },
                } as any}
                ownerCardId="card-1"
                ps={{
                    loading: false,
                    error: null,
                    busy: false,
                    item: {
                        code: "print('hi')",
                        exercise: {
                            id: "inline-ex",
                            kind: "code_input",
                            topic: "topic-1",
                            difficulty: "easy",
                            title: "Inline exercise",
                            prompt: "Type one line",
                            language: "python",
                            starterCode: "print('hi')",
                            ui: { codeSurface: "embedded" },
                        },
                    },
                    exercise: {
                        id: "inline-ex",
                        kind: "code_input",
                        topic: "topic-1",
                        difficulty: "easy",
                        title: "Inline exercise",
                        prompt: "Type one line",
                        language: "python",
                        starterCode: "print('hi')",
                        ui: { codeSurface: "embedded" },
                    },
                    attempts: 0,
                    maxAttempts: 3,
                }}
                toolsActive
                unlocked
                isCompleted={false}
                locked={false}
                unlimitedAttempts
                strictSequential={false}
                seqOrder={1}
                padRef={{ current: null } as any}
                onUpdateItem={vi.fn()}
                onSubmit={vi.fn()}
                onHelp={vi.fn()}
                onRetryExercise={vi.fn()}
                onExcused={vi.fn()}
            />,
        );

        const props = mocked.exerciseRendererProps.at(-1);
        expect(props?.codeRunnerMode).toBe("embedded");
        expect(props?.codeTools).toBeNull();
    });

    it("keeps completed full workspace exercises in tools mode for review", () => {
        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-complete-tools",
                    kind: "practice",
                    fetch: {
                        subject: "python",
                        module: "module-1",
                        section: "section-1",
                        topic: "topic-1",
                    },
                } as any}
                ownerCardId="card-1"
                ps={{
                    loading: false,
                    error: null,
                    busy: false,
                    item: {
                        code: "print('done')",
                        result: { ok: true, finalized: true },
                        exercise: {
                            id: "workspace-complete-ex",
                            kind: "code_input",
                            topic: "topic-1",
                            difficulty: "easy",
                            title: "Workspace review exercise",
                            prompt: "Review files",
                            language: "python",
                            workspace: {
                                starterFiles: {
                                    "main.py": "print('done')",
                                    "data/students.csv": "id,name\n1,Ada",
                                },
                            },
                        },
                    },
                    exercise: {
                        id: "workspace-complete-ex",
                        kind: "code_input",
                        topic: "topic-1",
                        difficulty: "easy",
                        title: "Workspace review exercise",
                        prompt: "Review files",
                        language: "python",
                        workspace: {
                            starterFiles: {
                                "main.py": "print('done')",
                                "data/students.csv": "id,name\n1,Ada",
                            },
                        },
                    },
                    attempts: 1,
                    maxAttempts: 3,
                    ok: true,
                }}
                toolsActive
                unlocked
                isCompleted={true}
                locked={false}
                unlimitedAttempts
                strictSequential={false}
                seqOrder={1}
                padRef={{ current: null } as any}
                onUpdateItem={vi.fn()}
                onSubmit={vi.fn()}
                onHelp={vi.fn()}
                onRetryExercise={vi.fn()}
                onExcused={vi.fn()}
            />,
        );

        const props = mocked.exerciseRendererProps.at(-1);
        expect(props?.codeRunnerMode).toBe("tools");
    });
});
