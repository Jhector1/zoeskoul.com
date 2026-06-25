import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuizPracticeCard, { flushReviewToolsBeforeSubmit } from "./QuizPracticeCard";
import type { CodeInputExercise, ValidateResponse } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import { DEFAULT_PRACTICE_HELP_POLICY } from "@/lib/practice/help/steps";

const mocked = vi.hoisted(() => ({
    exerciseRendererProps: [] as any[],
    registerCodeInput: vi.fn(),
    unregisterCodeInput: vi.fn(),
    requestBind: vi.fn(),
    ensureVisible: vi.fn(),
    setCodeInputMeta: vi.fn(),
    rawMessages: {
        "topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.starterCode":
            "print(\"Welcome to Python Club\")\n\n# Replace the preview line with the real event title.\n",
        "topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.prompt":
            "Start the real welcome board.",
    } as Record<string, string>,
}));

vi.mock("@/i18n/tagged", () => ({
    useTaggedT: () => ({
        t: (_key: string, _params?: unknown, fallback?: string) => fallback ?? "",
        raw: (key: string, fallback?: string) => mocked.rawMessages[key] ?? fallback ?? "",
    }),
    isTaggedKey: (value: string) => typeof value === "string" && value.startsWith("@:"),
    stripTag: (value: string) => value.replace(/^@:/, ""),
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

function makeCodeInputExercise(
    overrides: Partial<CodeInputExercise> = {},
    compat: Record<string, unknown> = {},
): CodeInputExercise {
    return {
        id: "test-ex",
        kind: "code_input",
        topic: "topic-1",
        difficulty: "easy",
        title: "Test exercise",
        prompt: "Write code",
        language: "python",
        starterCode: "print('hi')",
        ...overrides,
        ...compat,
    } as CodeInputExercise;
}

function makeQItem(args: {
    exercise: CodeInputExercise;
    code?: string;
    result?: ValidateResponse | null;
}): QItem {
    return {
        key: args.exercise.id,
        exercise: args.exercise,
        single: "",
        multi: [],
        num: "",
        dragA: { x: 0, y: 0, z: 0 },
        dragB: { x: 0, y: 0, z: 0 },
        matRows: 0,
        matCols: 0,
        mat: [],
        result: args.result ?? null,
        submitted: false,
        attempts: 0,
        code: args.code ?? "",
        codeLang: "python",
        codeStdin: "",
        text: "",
        voiceTranscript: "",
        help: {
            openedStepKeys: [],
            activeStepKey: null,
            entries: {},
            busyStepKey: null,
            error: null,
        },
    };
}

function makePracticeState(args: {
    item: QItem | null;
    exercise: CodeInputExercise | null;
    attempts?: number;
    maxAttempts?: number | null;
    ok?: boolean | null;
}) {
    return {
        loading: false,
        error: null,
        busy: false,
        item: args.item,
        exercise: args.exercise,
        attempts: args.attempts ?? 0,
        maxAttempts: args.maxAttempts ?? 3,
        ok: args.ok ?? null,
        helpPolicy: DEFAULT_PRACTICE_HELP_POLICY,
    };
}

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

    it("resolves tagged starter content from the project step manifest fallback", () => {
        const html = renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "proj:mp-1-print-event-title:abc",
                    kind: "practice",
                    fetch: {
                        subject: "python-v2",
                        module: "python-v2-0",
                        section: "python-v2-python-v2-0-module-project",
                        topic: "module-0-welcome-board-project",
                        exerciseKey: "mp-1-print-event-title",
                    },
                } as any}
                ownerCardId="module-0-welcome-board-project"
                projectStepManifest={{
                    id: "mp_1",
                    exerciseKey: "mp-1-print-event-title",
                    title: "Set the event title",
                    prompt:
                        "@:topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.prompt",
                    starterCode:
                        "@:topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.starterCode",
                    starterFiles: {
                        "main.py":
                            "@:topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.starterCode",
                    },
                    workspace: {
                        language: "python",
                        entryFile: "main.py",
                        starterFiles: {
                            "main.py":
                                "@:topics.python-v2.python-v2-0.module-0-welcome-board-project.quiz.mp-1-print-event-title.starterCode",
                        },
                    },
                }}
                ps={{
                    loading: true,
                    error: null,
                    busy: false,
                    item: null,
                    exercise: null,
                    attempts: 0,
                    maxAttempts: 3,
                } as any}
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

        expect(html).toContain('data-testid="exercise-renderer"');
        expect(html).toContain("print(&quot;Welcome to Python Club&quot;)");
        expect(html).not.toContain("@:topics.python-v2");
    });

    it("preserves project step ideConfig on fallback exercises", () => {
        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-terminal-cwd",
                    kind: "practice",
                    fetch: {
                        subject: "linux-terminal-fundamentals",
                        module: "linux-module-1-terminal-navigation",
                        section: "linux-terminal-fundamentals-linux-module-1-project",
                        topic: "module-1-terminal-map-project",
                        exerciseKey: "module-1-terminal-map-project-terminal-task-2",
                    },
                } as any}
                projectStepManifest={{
                    id: "module-1-terminal-map-project-terminal-task-2",
                    exerciseKey: "module-1-terminal-map-project-terminal-task-2",
                    title: "Find the requests folder",
                    prompt: "From inside park-terminal-map, list what is there, move into requests, and use pwd to confirm you found the request notes.",
                    language: "bash",
                    starterCode: "# Use the terminal for this Linux project step.\n",
                    workspace: {
                        language: "bash",
                        entryFile: "main.sh",
                        starterFiles: {
                            "main.sh": "# Use the terminal for this Linux project step.\n",
                        },
                    },
                    ideConfig: {
                        runnerBackend: "pty",
                        layoutMode: "terminal_workspace",
                        terminalSessionScope: "exercise",
                        terminalCwd: "/workspace/park-terminal-map",
                        requires: {
                            files: true,
                            multiFile: true,
                            terminal: true,
                        },
                    },
                }}
                ps={{
                    loading: true,
                    error: null,
                    busy: false,
                    item: null,
                    exercise: null,
                    attempts: 0,
                    maxAttempts: 3,
                } as any}
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
            />,
        );

        const lastProps = mocked.exerciseRendererProps.at(-1);
        expect(lastProps?.exercise?.ideConfig?.terminalCwd).toBe("/workspace/park-terminal-map");
        expect(lastProps?.exercise?.ideConfig?.terminalSessionScope).toBe("exercise");
    });

    it("lets the current project step ideConfig override stale exercise ideConfig", () => {
        const staleExercise = makeCodeInputExercise(
            {
                id: "module-1-terminal-map-project-terminal-task-2",
                language: "bash" as any,
                ideConfig: {
                    runnerBackend: "pty",
                    layoutMode: "terminal_workspace",
                    terminalSessionScope: "exercise",
                    terminalCwd: "/workspace",
                    requires: {
                        files: true,
                        multiFile: true,
                        terminal: true,
                    },
                } as any,
            },
            {
                workspace: {
                    language: "bash",
                    entryFile: "main.sh",
                    starterFiles: {
                        "main.sh": "# terminal step\n",
                    },
                },
            },
        );

        renderToStaticMarkup(
            <QuizPracticeCard
                q={{
                    id: "practice-terminal-cwd-stale",
                    kind: "practice",
                    fetch: {
                        subject: "linux-terminal-fundamentals",
                        module: "linux-module-1-terminal-navigation",
                        section: "linux-terminal-fundamentals-linux-module-1-project",
                        topic: "module-1-terminal-map-project",
                        exerciseKey: "module-1-terminal-map-project-terminal-task-2",
                    },
                } as any}
                projectStepManifest={{
                    id: "module-1-terminal-map-project-terminal-task-2",
                    exerciseKey: "module-1-terminal-map-project-terminal-task-2",
                    title: "Find the requests folder",
                    prompt: "From inside park-terminal-map, list what is there, move into requests, and use pwd to confirm you found the request notes.",
                    language: "bash",
                    starterCode: "# Use the terminal for this Linux project step.\n",
                    workspace: {
                        language: "bash",
                        entryFile: "main.sh",
                        starterFiles: {
                            "main.sh": "# Use the terminal for this Linux project step.\n",
                        },
                    },
                    ideConfig: {
                        runnerBackend: "pty",
                        layoutMode: "terminal_workspace",
                        terminalSessionScope: "exercise",
                        terminalCwd: "/workspace/park-terminal-map",
                        requires: {
                            files: true,
                            multiFile: true,
                            terminal: true,
                        },
                    },
                }}
                ps={makePracticeState({
                    item: makeQItem({ code: "", exercise: staleExercise }),
                    exercise: staleExercise,
                })}
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
            />,
        );

        const lastProps = mocked.exerciseRendererProps.at(-1);
        expect(lastProps?.exercise?.ideConfig?.terminalCwd).toBe("/workspace/park-terminal-map");

    });

    it("routes file-based Python exercises through Tools", () => {
        const exercise = makeCodeInputExercise(
            {
                id: "workspace-ex",
                title: "Workspace exercise",
                prompt: "Edit files",
            },
            {
                workspace: {
                    starterFiles: {
                        "main.py": "print('hi')",
                        "note.txt": "remember me",
                    },
                },
            },
        );

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
                ps={makePracticeState({
                    item: makeQItem({ code: "print('hi')", exercise }),
                    exercise,
                })}
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
        const exercise = makeCodeInputExercise({
            id: "default-tools-ex",
            title: "Default tools exercise",
            prompt: "Type one line",
        });

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
                ps={makePracticeState({
                    item: makeQItem({ code: "print('hi')", exercise }),
                    exercise,
                })}
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
        const exercise = makeCodeInputExercise({
            id: "inline-ex",
            title: "Inline exercise",
            prompt: "Type one line",
            ui: { codeSurface: "embedded" },
        });

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
                ps={makePracticeState({
                    item: makeQItem({ code: "print('hi')", exercise }),
                    exercise,
                })}
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
        const exercise = makeCodeInputExercise(
            {
                id: "workspace-complete-ex",
                title: "Workspace review exercise",
                prompt: "Review files",
            },
            {
                workspace: {
                    starterFiles: {
                        "main.py": "print('done')",
                        "data/students.csv": "id,name\n1,Ada",
                    },
                },
            },
        );

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
                ps={makePracticeState({
                    item: makeQItem({
                        code: "print('done')",
                        exercise,
                        result: { ok: true, finalized: true, expected: null },
                    }),
                    exercise,
                    attempts: 1,
                    ok: true,
                })}
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
