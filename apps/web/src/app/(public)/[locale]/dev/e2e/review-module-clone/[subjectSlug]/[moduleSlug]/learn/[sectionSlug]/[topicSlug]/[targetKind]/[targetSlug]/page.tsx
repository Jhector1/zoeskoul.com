import { notFound } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { getResolvedReviewModule } from "@/lib/subjects/server/resolveSubjectPresentation";
import { buildDraftPreviewReviewModule } from "@/lib/dev/curriculumDrafts/preview";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";

export const runtime = "nodejs";

const runtimeDefaults = {
    kind: "code",
    language: "python",
} as const;

const E2E_I18N_STARTER_CODE_REF =
    "@:topics.python-v2.python-v2-2.and-or-not.quiz.code_ticket_check.starterCode";
const E2E_I18N_STARTER_MESSAGE_BASE =
    "topics.python-v2.python-v2-2.and-or-not.quiz.code_ticket_check";

const e2eI18nStarterFiles = {
    "main.py": E2E_I18N_STARTER_CODE_REF,
};

const e2eI18nSolutionFiles = {
    "main.py":
        "age = int(input())\n" +
        "has_id = input().strip()\n\n" +
        "if age >= 18 and has_id == \"yes\":\n" +
        "    print(\"allowed\")\n" +
        "else:\n" +
        "    print(\"denied\")\n",
};

const terminalCloneRuntimeDefaults = {
    kind: "code",
    language: "bash",
} as const;

const E2E_TERMINAL_CWD = "/workspace/park-terminal-map";
const E2E_TERMINAL_FEEDBACK_REF =
    "@:topics.linux-terminal-fundamentals.linux-module-1-terminal-navigation.module-1-terminal-map-project.moduleProject.steps.module-1-terminal-map-project-terminal-task-2.terminalExpectations.requiredCommands.0.message";


type DevRunnerBackend = "auto" | "judge0" | "pty";

const defaultServiceDefaults = {
    preset: "runner",
    runnerBackend: "judge0" as DevRunnerBackend,
    requires: {
        files: true,
        multiFile: true,
        terminal: false,
        projectPersistence: false,
        cloudProjects: false,
    },
} as const;

const terminalCloneServiceDefaults = {
    ...defaultServiceDefaults,
    runnerBackend: "pty" as DevRunnerBackend,
    layoutMode: "terminal_workspace",
    requires: {
        ...defaultServiceDefaults.requires,
        files: true,
        multiFile: true,
        terminal: true,
    },
} as const;


function resolveDevRunnerBackend(
    searchParams: Record<string, string | string[] | undefined>,
): DevRunnerBackend {
    const raw = searchParams.runnerBackend ?? searchParams.backend;
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (value === "pty" || value === "judge0" || value === "auto") {
        return value;
    }

    return "judge0";
}

function serviceDefaultsForBackend(
    backend: DevRunnerBackend,
): NonNullable<ReviewModule["serviceDefaults"]> {
    return {
        ...defaultServiceDefaults,
        runnerBackend: backend,
    };
}

const exerciseAStarterFiles = {
    "main.py": "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
    "helper.py": "def shout(value):\n    return value.upper()\n",
};

const exerciseASolutionFiles = {
    "main.py":
        "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
    "helper.py": "def shout(value):\n    return value.upper()\n",
};

const exerciseBStarterFiles = {
    "main.py": "message = 'second exercise starter marker'\nprint(message)\n",
};

const exerciseBSolutionFiles = {
    "main.py": "message = 'second exercise starter marker solved'\nprint(message)\n",
};

const blankFallbackStarterFiles = {
    "main.py": "",
};

const blankFallbackSolutionFiles = {
    "main.py": "",
};

const revealMultiFileStarterFiles = {
    "main.py":
        "from tools.names import clean_name\n" +
        "# TODO: import make_badge from tools.badges\n\n" +
        "raw_name = input()\n" +
        "role = input()\n" +
        "name = clean_name(raw_name)\n" +
        "# TODO: print the badge\n",
    "tools/__init__.py": "",
    "tools/names.py":
        "def clean_name(value):\n" +
        "    return value.strip().title()\n",
};

const revealMultiFileSolutionFiles = {
    "main.py":
        "from tools.names import clean_name\n" +
        "from tools.badges import make_badge\n\n" +
        "raw_name = input()\n" +
        "role = input()\n" +
        "name = clean_name(raw_name)\n" +
        "print(make_badge(name, role))\n",
    "tools/__init__.py": "",
    "tools/names.py":
        "def clean_name(value):\n" +
        "    return value.strip().title()\n",
    "tools/badges.py":
        "def make_badge(name, role):\n" +
        "    return f\"{role.upper()} badge: {name}\"\n",
};

const sqlRuntimeDefaults = {
    kind: "sql",
    datasetId: "products_catalog",
    fixedSqlDialect: "sqlite",
    resultShape: "table",
} as const;

const sqlReviewCloneTopic = {
    id: "e2e-sql-topic",
    label: "E2E SQL Topic",
    minutes: 5,
    summary:
        "A deterministic SQL topic used to verify module runtimeDefaults hydrate the Tools panel outside exercise scope.",
    meta: {},
    cards: [
        {
            type: "text",
            id: "e2e-sql-reading",
            title: "SQL module runtimeDefaults",
            markdown:
                "This card is intentionally not an exercise. The right Tools rail should still receive the module-level SQL dataset.",
        },
        {
            type: "text",
            id: "e2e-sql-second-reading",
            title: "Second SQL reading card",
            markdown:
                "This second non-exercise SQL card verifies runtimeDefaults survive card navigation.",
        },
    ],
} satisfies ReviewModule["topics"][number];

const sqlReviewCloneSection = {
    id: "e2e-sql-section",
    slug: "e2e-sql-section",
    title: "E2E SQL Section",
    summary: "A dev-only SQL section for runtime default tests.",
    description:
        "This clone intentionally tests SQL module runtimeDefaults outside exercise scope.",
    order: 1,
    topics: [sqlReviewCloneTopic],
} satisfies NonNullable<ReviewModule["sections"]>[number];

const sqlReviewCloneModule: ReviewModule = {
    id: "e2e-sql-review-clone",
    profileId: "sql",
    versionFamily: "sql",
    title: "E2E SQL Review Module Clone",
    subtitle:
        "Dev-only SQL clone that verifies module runtimeDefaults reach the real Tools rail.",
    startPracticeSectionSlug: "e2e-sql-section",
    runtimeDefaults: sqlRuntimeDefaults,
    topics: [sqlReviewCloneTopic],
    sections: [sqlReviewCloneSection],
    contentVersion: null,
};

const exerciseADefinition = {
    id: "e2e-print-name",
    title: "Print a name",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: exerciseAStarterFiles,
        solutionFiles: exerciseASolutionFiles,
    },
    starterCode: exerciseAStarterFiles["main.py"],
    solutionCode: exerciseASolutionFiles["main.py"],
};

const exerciseBDefinition = {
    id: "e2e-helper-name",
    title: "Second exercise isolation check",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: exerciseBStarterFiles,
        solutionFiles: exerciseBSolutionFiles,
    },
    starterCode: exerciseBStarterFiles["main.py"],
    solutionCode: exerciseBSolutionFiles["main.py"],
};

const blankFallbackExerciseDefinition = {
    id: "e2e-blank-fallback",
    title: "Blank fallback exercise",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: blankFallbackStarterFiles,
        solutionFiles: blankFallbackSolutionFiles,
    },
    starterCode: "",
    solutionCode: "",
};

const revealMultiFileDefinition = {
    id: "e2e-reveal-fill-multifile",
    title: "Reveal fill creates helper files",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: revealMultiFileStarterFiles,
        solutionFiles: revealMultiFileSolutionFiles,
    },
    starterCode: revealMultiFileStarterFiles["main.py"],
    solutionCode: revealMultiFileSolutionFiles["main.py"],
    solutionFiles: revealMultiFileSolutionFiles,
};

const e2eI18nStarterDefinition = {
    id: "e2e-i18n-starter",
    title: "I18N starter code should resolve",
    kind: "code_input",
    purpose: "project",
    messageBase: E2E_I18N_STARTER_MESSAGE_BASE,
    language: "python",
    runtime: runtimeDefaults,
    starterCode: E2E_I18N_STARTER_CODE_REF,
    starterFiles: e2eI18nStarterFiles,
    solutionFiles: e2eI18nSolutionFiles,
    workspace: {
        language: "python",
        entryFile: "main.py",
        entryFilePath: "main.py",
        starterCode: E2E_I18N_STARTER_CODE_REF,
        starterFiles: e2eI18nStarterFiles,
        solutionFiles: e2eI18nSolutionFiles,
    },
    recipe: {
        type: "fixed_tests",
        tests: [
            { stdin: "20\nyes\n", stdout: "allowed\n", match: "exact" },
            { stdin: "16\nyes\n", stdout: "denied\n", match: "exact" },
        ],
        solutionCode: e2eI18nSolutionFiles["main.py"],
        solutionFiles: e2eI18nSolutionFiles,
    },
    solutionCode: e2eI18nSolutionFiles["main.py"],
};

const e2eI18nProjectStep = {
    id: "e2e-i18n-starter",
    title: "I18N starter code should resolve",
    exerciseKey: "e2e-i18n-starter",
    topic: "e2e-review-topic",
    difficulty: "easy",
    preferKind: "code_input",
    seedPolicy: "global",
    maxAttempts: 3,
    runtime: runtimeDefaults,
    starterCode: E2E_I18N_STARTER_CODE_REF,
    starterFiles: e2eI18nStarterFiles,
    solutionCode: e2eI18nSolutionFiles["main.py"],
    solutionFiles: e2eI18nSolutionFiles,
    workspace: {
        language: "python",
        entryFile: "main.py",
        entryFilePath: "main.py",
        starterCode: E2E_I18N_STARTER_CODE_REF,
        starterFiles: e2eI18nStarterFiles,
        solutionFiles: e2eI18nSolutionFiles,
    },
} as any;

const e2eI18nEmbeddedTryItCard = {
    type: "text",
    id: "e2e-i18n-tryit-reading",
    title: "E2E i18n starter Try It",
    markdown:
        "This dev-only card intentionally uses an @: starterCode key so E2E can verify embedded Try It resolves localized starter code before Tools binding.",
    tryIt: {
        id: "try-e2e-i18n-starter",
        title: "Resolve i18n starter code",
        prompt: "The editor should contain the resolved Python starter, not a blank file and not an @: key.",
        exerciseKey: "e2e-i18n-starter",
        difficulty: "easy",
        preferKind: "code_input",
        seedPolicy: "global",
        required: true,
        allowReveal: true,
        maxAttempts: 3,
        spec: {
            mode: "project",
            subject: "python",
            moduleSlug: "e2e-review-clone",
            section: "e2e-section",
            topic: "e2e-review-topic",
            difficulty: "easy",
            preferKind: "code_input",
            allowReveal: true,
            maxAttempts: 3,
            runtime: runtimeDefaults,
            steps: [e2eI18nProjectStep],
        },
    },
} satisfies ReviewCard;

const projectStep2StarterFiles = {
    "main.py": "total = int(input())\n# TODO: print shipping cost\n",
};

const projectStep2SolutionFiles = {
    "main.py":
        "def shipping_cost(total):\n    return 0 if total >= 50 else 7\n\n" +
        "total = int(input())\nprint(f'Shipping = {shipping_cost(total)}')\n",
};

const projectStep3StarterFiles = {
    "main.py": "def sum_list(xs):\n    # TODO\n    pass\n\nvalues = [1, 2, 3]\n# TODO\n",
};

const projectStep3SolutionFiles = {
    "main.py":
        "def sum_list(xs):\n    total = 0\n    for value in xs:\n        total += value\n    return total\n\n" +
        "values = [1, 2, 3]\nprint(sum_list(values))\n",
};

const fileIoFixtureText = "Hello, World!\nThis is a test file.";

const fileIoStarterFiles = {
    "main.py": "# Write your answer below\n",
    "data.txt": fileIoFixtureText,
};

const fileIoSolutionFiles = {
    "main.py":
        "with open('data.txt', 'r') as file:\n    content = file.read()\n    print(content)\n",
    "data.txt": fileIoFixtureText,
};

const fileIoWorkspaceFiles = [
    {
        path: "data.txt",
        content: fileIoFixtureText,
        readOnly: true,
    },
];

const projectStep2Definition = {
    id: "e2e-project-step-2",
    title: "Shipping cost helper",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: projectStep2StarterFiles,
        solutionFiles: projectStep2SolutionFiles,
    },
    starterCode: projectStep2StarterFiles["main.py"],
    solutionCode: projectStep2SolutionFiles["main.py"],
};

const projectStep3Definition = {
    id: "e2e-project-step-3",
    title: "Sum a list helper",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: projectStep3StarterFiles,
        solutionFiles: projectStep3SolutionFiles,
    },
    starterCode: projectStep3StarterFiles["main.py"],
    solutionCode: projectStep3SolutionFiles["main.py"],
};

const fileIoDefinition = {
    id: "e2e-file-io",
    title: "Read a fixture file",
    runtime: runtimeDefaults,
    workspace: {
        language: "python",
        entryFile: "main.py",
        starterFiles: fileIoStarterFiles,
        solutionFiles: fileIoSolutionFiles,
        files: fileIoWorkspaceFiles,
        fixtureFiles: fileIoWorkspaceFiles,
        initialFiles: fileIoWorkspaceFiles,
        workspaceFiles: fileIoWorkspaceFiles,
        fixtures: fileIoWorkspaceFiles,
        fileFixtures: fileIoWorkspaceFiles,
    } as any,
    starterFiles: fileIoStarterFiles,
    solutionFiles: fileIoSolutionFiles,
    files: fileIoWorkspaceFiles,
    fixtureFiles: fileIoWorkspaceFiles,
    initialFiles: fileIoWorkspaceFiles,
    workspaceFiles: fileIoWorkspaceFiles,
    fixtures: fileIoWorkspaceFiles,
    fileFixtures: fileIoWorkspaceFiles,
    starterCode: fileIoStarterFiles["main.py"],
    solutionCode: fileIoSolutionFiles["main.py"],
};

const linuxTerminalStepAStarterFiles = {
    "README.md": "Use the terminal to create linux-start/hello.txt\n",
};

const linuxTerminalStepASolutionFiles = {
    "README.md": "Use the terminal to create linux-start/hello.txt\n",
    "linux-start/hello.txt": "",
};

const linuxTerminalStepBStarterFiles = {
    "README.md": "Use the terminal to create linux-start/command-practice.txt\n",
};

const linuxTerminalStepBSolutionFiles = {
    "README.md": "Use the terminal to create linux-start/command-practice.txt\n",
    "linux-start/command-practice.txt": "",
};

const linuxTerminalMapStarterFiles = {
    "README.md": "Use the terminal from park-terminal-map.\n",
    "park-terminal-map/handoff/brief.txt": "handoff fixture\n",
    "park-terminal-map/maps/current.txt": "map fixture\n",
    "park-terminal-map/requests/todo.txt": "request fixture\n",
};

const linuxTerminalMapSolutionFiles = {
    ...linuxTerminalMapStarterFiles,
};

const linuxTerminalMapFixtureFiles = [
    { path: "park-terminal-map/handoff/brief.txt", content: "handoff fixture\n" },
    { path: "park-terminal-map/maps/current.txt", content: "map fixture\n" },
    { path: "park-terminal-map/requests/todo.txt", content: "request fixture\n" },
];

const linuxTerminalCwdIdeConfig = {
    runnerBackend: "pty",
    layoutMode: "terminal_workspace",
    terminalSessionScope: "exercise",
    terminalCwd: E2E_TERMINAL_CWD,
    fileActions: {
        enabled: false,
    },
    requires: {
        files: true,
        multiFile: true,
        terminal: true,
    },
} as const;

const linuxTerminalCwdRecipe = {
    type: "shell_task",
    mode: "terminal_workspace",
    instructions: "Run ls from inside park-terminal-map, then cd into requests.",
    terminalExpectations: {
        requiredCommands: [
            {
                command: "ls",
                message: E2E_TERMINAL_FEEDBACK_REF,
            },
        ],
    },
    workspaceExpectations: [
        { path: "park-terminal-map/requests", type: "directory" },
    ],
};

const linuxTerminalCwdDefinition = {
    id: "e2e-linux-terminal-cwd",
    title: "From inside park-terminal-map",
    kind: "code_input",
    purpose: "project",
    language: "bash",
    runtime: terminalCloneRuntimeDefaults,
    serviceOverrides: {
        terminalSessionScope: "exercise",
    },
    ideConfig: linuxTerminalCwdIdeConfig,
    recipe: linuxTerminalCwdRecipe,
    workspace: {
        language: "bash",
        entryFile: "README.md",
        entryFilePath: "README.md",
        starterFiles: linuxTerminalMapStarterFiles,
        solutionFiles: linuxTerminalMapSolutionFiles,
        files: linuxTerminalMapFixtureFiles,
        fixtureFiles: linuxTerminalMapFixtureFiles,
        initialFiles: linuxTerminalMapFixtureFiles,
        workspaceFiles: linuxTerminalMapFixtureFiles,
        fixtures: linuxTerminalMapFixtureFiles,
        fileFixtures: linuxTerminalMapFixtureFiles,
    },
    starterFiles: linuxTerminalMapStarterFiles,
    solutionFiles: linuxTerminalMapSolutionFiles,
    files: linuxTerminalMapFixtureFiles,
    fixtureFiles: linuxTerminalMapFixtureFiles,
    initialFiles: linuxTerminalMapFixtureFiles,
    workspaceFiles: linuxTerminalMapFixtureFiles,
    fixtures: linuxTerminalMapFixtureFiles,
    fileFixtures: linuxTerminalMapFixtureFiles,
    starterCode: linuxTerminalMapStarterFiles["README.md"],
    solutionCode: linuxTerminalMapSolutionFiles["README.md"],
};

const linuxTerminalCwdProjectStep = {
    id: "e2e-linux-terminal-cwd",
    title: "From inside park-terminal-map",
    exerciseKey: "e2e-linux-terminal-cwd",
    topic: "e2e-terminal-topic",
    difficulty: "easy",
    preferKind: "code_input",
    seedPolicy: "global",
    maxAttempts: 3,
    runtime: terminalCloneRuntimeDefaults,
    serviceOverrides: {
        terminalSessionScope: "exercise",
    },
    ideConfig: linuxTerminalCwdIdeConfig,
    recipe: linuxTerminalCwdRecipe,
    workspace: linuxTerminalCwdDefinition.workspace,
    starterFiles: linuxTerminalMapStarterFiles,
    solutionFiles: linuxTerminalMapSolutionFiles,
    files: linuxTerminalMapFixtureFiles,
    fixtureFiles: linuxTerminalMapFixtureFiles,
    initialFiles: linuxTerminalMapFixtureFiles,
    workspaceFiles: linuxTerminalMapFixtureFiles,
    fixtures: linuxTerminalMapFixtureFiles,
    fileFixtures: linuxTerminalMapFixtureFiles,
    starterCode: linuxTerminalMapStarterFiles["README.md"],
    solutionCode: linuxTerminalMapSolutionFiles["README.md"],
} as any;

const linuxTerminalCwdProjectCard = {
    type: "project",
    id: "review-clone-terminal-cwd-project",
    title: "Review Clone Terminal CWD Project",
    passScore: 1,
    spec: {
        mode: "project",
        subject: "linux",
        moduleSlug: "e2e-terminal-review-clone",
        section: "e2e-terminal-section",
        topic: "e2e-terminal-topic",
        difficulty: "easy",
        preferKind: "code_input",
        allowReveal: true,
        maxAttempts: 3,
        runtime: terminalCloneRuntimeDefaults,
        steps: [linuxTerminalCwdProjectStep],
    },
} satisfies ReviewCard;

const linuxTerminalCwdEmbeddedTryItCard = {
    type: "text",
    id: "e2e-linux-terminal-cwd-reading",
    title: "E2E terminal cwd embedded Try It",
    markdown:
        "This dev-only card intentionally uses a Linux terminal_workspace project step so E2E can verify terminalCwd and @: feedback resolution before Tools binding.",
    tryIt: {
        id: "try-e2e-linux-terminal-cwd",
        title: "Terminal cwd should bind",
        prompt: "The active terminal workspace should start inside park-terminal-map.",
        exerciseKey: "e2e-linux-terminal-cwd",
        difficulty: "easy",
        preferKind: "code_input",
        seedPolicy: "global",
        required: true,
        allowReveal: true,
        maxAttempts: 3,
        spec: {
            mode: "project",
            subject: "linux",
            moduleSlug: "e2e-terminal-review-clone",
            section: "e2e-terminal-section",
            topic: "e2e-terminal-topic",
            difficulty: "easy",
            preferKind: "code_input",
            allowReveal: true,
            maxAttempts: 3,
            runtime: terminalCloneRuntimeDefaults,
            steps: [linuxTerminalCwdProjectStep],
        },
    },
} satisfies ReviewCard;

function makeProjectCard({
                             id,
                             title,
                             steps,
                         }: {
    id: string;
    title: string;
    steps: Array<{
        id: string;
        title: string;
        starterFiles: Record<string, string>;
        solutionFiles: Record<string, string>;
        starterCode: string;
        solutionCode: string;
        files?: Array<{ path: string; content: string; readOnly?: boolean }>;
        fixtureFiles?: Array<{ path: string; content: string; readOnly?: boolean }>;
        initialFiles?: Array<{ path: string; content: string; readOnly?: boolean }>;
        workspaceFiles?: Array<{ path: string; content: string; readOnly?: boolean }>;
        fixtures?: Array<{ path: string; content: string; readOnly?: boolean }>;
        fileFixtures?: Array<{ path: string; content: string; readOnly?: boolean }>;
    }>;
}): ReviewCard {
    return {
        type: "project",
        id,
        title,
        passScore: 1,
        spec: {
            mode: "project",
            subject: "python",
            moduleSlug: "e2e-review-clone",
            section: "e2e-section",
            topic: "e2e-review-topic",
            difficulty: "easy",
            preferKind: "code_input",
            allowReveal: true,
            maxAttempts: 3,
            runtime: runtimeDefaults,
            steps: steps.map((step) => ({
                id: step.id,
                title: step.title,
                exerciseKey: step.id,
                topic: "e2e-review-topic",
                difficulty: "easy",
                preferKind: "code_input",
                maxAttempts: 3,
                runtime: runtimeDefaults,
                workspace: {
                    language: "python",
                    entryFile: "main.py",
                    starterFiles: step.starterFiles,
                    solutionFiles: step.solutionFiles,
                    ...(step.files?.length
                        ? {
                            files: step.files,
                            fixtureFiles: (step as any).fixtureFiles ?? step.files,
                            initialFiles: (step as any).initialFiles ?? step.files,
                            workspaceFiles: (step as any).workspaceFiles ?? step.files,
                            fixtures: (step as any).fixtures ?? step.files,
                            fileFixtures: (step as any).fileFixtures ?? step.files,
                        }
                        : {}),
                },
                starterCode: step.starterCode,
                solutionCode: step.solutionCode,
                solutionFiles: step.solutionFiles,
            } as any)),
        },
    };
}

const reviewClonePracticeQuizCard = {
    type: "quiz",
    id: "review-clone-practice-quiz",
    title: "Review Clone Practice Key Refresh",
    passScore: 1,
    spec: {
        subject: "python",
        module: "e2e-review-clone",
        moduleSlug: "e2e-review-clone",
        section: "e2e-section",
        topic: "e2e-review-topic",
        difficulty: "easy",
        n: 1,
        allowReveal: true,
        preferKind: "code_input",
        maxAttempts: 3,
        runtime: runtimeDefaults,
    },
} satisfies ReviewCard;

function cloneReviewModuleWithServiceDefaults(
    mod: ReviewModule,
    serviceDefaults: NonNullable<ReviewModule["serviceDefaults"]>,
): ReviewModule {
    const topics = (mod.topics ?? []).map((topic) => ({
        ...topic,
        meta: {
            ...(topic.meta ?? {}),
            serviceDefaults,
        },
    }));

    const topicById = new Map(topics.map((topic) => [topic.id, topic]));

    return {
        ...mod,
        serviceDefaults,
        topics,
        sections: (mod.sections ?? []).map((section) => ({
            ...section,
            topics: section.topics.map((topic) => topicById.get(topic.id) ?? topic),
        })),
    };
}

const reviewCloneTopic = {
    id: "e2e-review-topic",
    label: "E2E Review Topic",
    minutes: 5,
    summary:
        "A deterministic topic used to test the real review module page, route target sync, tools rail, progress save, and workspace restore.",
    meta: {
        runtimeDefaults,
        serviceDefaults: defaultServiceDefaults,
        rawManifest: {
            exercises: [
                exerciseADefinition,
                exerciseBDefinition,
                blankFallbackExerciseDefinition,
                projectStep2Definition,
                projectStep3Definition,
                fileIoDefinition,
                revealMultiFileDefinition,
                e2eI18nStarterDefinition,
            ],
        },
    },
    cards: [
        {
            type: "text",
            id: "e2e-reading",
            title: "Read before coding",
            markdown:
                "This is a real review-module clone. It uses the real review shell, topic flow, progress hook, runtime store, tools rail, and editor hydration path.",
        },
        e2eI18nEmbeddedTryItCard,
        reviewClonePracticeQuizCard,
        makeProjectCard({
            id: "review-clone-i18n-project",
            title: "Review Clone I18N Starter Project",
            steps: [
                {
                    id: "e2e-i18n-starter",
                    title: "I18N starter code should resolve",
                    starterFiles: e2eI18nStarterFiles,
                    solutionFiles: e2eI18nSolutionFiles,
                    starterCode: E2E_I18N_STARTER_CODE_REF,
                    solutionCode: e2eI18nSolutionFiles["main.py"],
                },
            ],
        }),
        makeProjectCard({
            id: "review-clone-project",
            title: "Review Clone Project A",
            steps: [
                {
                    id: "e2e-print-name",
                    title: "Edit and run starter code",
                    starterFiles: exerciseAStarterFiles,
                    solutionFiles: exerciseASolutionFiles,
                    starterCode: exerciseAStarterFiles["main.py"],
                    solutionCode: exerciseASolutionFiles["main.py"],
                },
                {
                    id: "e2e-project-step-2",
                    title: "Build a shipping helper",
                    starterFiles: projectStep2StarterFiles,
                    solutionFiles: projectStep2SolutionFiles,
                    starterCode: projectStep2StarterFiles["main.py"],
                    solutionCode: projectStep2SolutionFiles["main.py"],
                },
                {
                    id: "e2e-project-step-3",
                    title: "Build a sum helper",
                    starterFiles: projectStep3StarterFiles,
                    solutionFiles: projectStep3SolutionFiles,
                    starterCode: projectStep3StarterFiles["main.py"],
                    solutionCode: projectStep3SolutionFiles["main.py"],
                },
                {
                    id: "e2e-file-io",
                    title: "Read a fixture file",
                    starterFiles: fileIoStarterFiles,
                    solutionFiles: fileIoSolutionFiles,
                    starterCode: fileIoStarterFiles["main.py"],
                    solutionCode: fileIoSolutionFiles["main.py"],
                    files: fileIoWorkspaceFiles,
                    fixtureFiles: fileIoWorkspaceFiles,
                    initialFiles: fileIoWorkspaceFiles,
                    workspaceFiles: fileIoWorkspaceFiles,
                    fixtures: fileIoWorkspaceFiles,
                    fileFixtures: fileIoWorkspaceFiles,
                },
            ],
        }),
        makeProjectCard({
            id: "review-clone-project-b",
            title: "Review Clone Project B",
            steps: [
                {
                    id: "e2e-helper-name",
                    title: "Second exercise isolation check",
                    starterFiles: exerciseBStarterFiles,
                    solutionFiles: exerciseBSolutionFiles,
                    starterCode: exerciseBStarterFiles["main.py"],
                    solutionCode: exerciseBSolutionFiles["main.py"],
                },
            ],
        }),
        makeProjectCard({
            id: "review-clone-reveal-fill-multifile",
            title: "Reveal Fill Multi-File",
            steps: [
                {
                    id: "e2e-reveal-fill-multifile",
                    title: "Fill answer should create tools/badges.py",
                    starterFiles: revealMultiFileStarterFiles,
                    solutionFiles: revealMultiFileSolutionFiles,
                    starterCode: revealMultiFileStarterFiles["main.py"],
                    solutionCode: revealMultiFileSolutionFiles["main.py"],
                },
            ],
        }),
        makeProjectCard({
            id: "review-clone-project-blank",
            title: "Review Clone Blank Fallback",
            steps: [
                {
                    id: "e2e-blank-fallback",
                    title: "Blank fallback exercise",
                    starterFiles: blankFallbackStarterFiles,
                    solutionFiles: blankFallbackSolutionFiles,
                    starterCode: "",
                    solutionCode: "",
                },
            ],
        }),
    ],
} satisfies ReviewModule["topics"][number];

const linuxTerminalCloneTopic = {
    id: "e2e-terminal-topic",
    label: "E2E Terminal Topic",
    minutes: 5,
    summary:
        "A dev-only topic used to test terminal_workspace review flows without catalog billing gates.",
    meta: {
        runtimeDefaults: terminalCloneRuntimeDefaults,
        serviceDefaults: terminalCloneServiceDefaults,
        rawManifest: {
            exercises: [
                {
                    id: "e2e-linux-start",
                    title: "Create linux-start",
                    runtime: runtimeDefaults,
                    workspace: {
                        language: "bash",
                        entryFile: "README.md",
                        starterFiles: linuxTerminalStepAStarterFiles,
                        solutionFiles: linuxTerminalStepASolutionFiles,
                    },
                    starterCode: linuxTerminalStepAStarterFiles["README.md"],
                    solutionCode: linuxTerminalStepASolutionFiles["README.md"],
                },
                {
                    id: "e2e-linux-command-practice",
                    title: "Make command practice",
                    runtime: runtimeDefaults,
                    workspace: {
                        language: "bash",
                        entryFile: "README.md",
                        starterFiles: linuxTerminalStepBStarterFiles,
                        solutionFiles: linuxTerminalStepBSolutionFiles,
                    },
                    starterCode: linuxTerminalStepBStarterFiles["README.md"],
                    solutionCode: linuxTerminalStepBSolutionFiles["README.md"],
                },
                linuxTerminalCwdDefinition,
            ],
        },
    },
    cards: [
        {
            type: "text",
            id: "e2e-terminal-reading",
            title: "Read before using the terminal",
            markdown:
                "This dev-only terminal clone exists to test terminal workspace review flows with deterministic routing and no billing gates.",
        },
        linuxTerminalCwdEmbeddedTryItCard,
        linuxTerminalCwdProjectCard,
        makeProjectCard({
            id: "review-clone-terminal-project",
            title: "Review Clone Terminal Project",
            steps: [
                {
                    id: "e2e-linux-start",
                    title: "Create linux-start",
                    starterFiles: linuxTerminalStepAStarterFiles,
                    solutionFiles: linuxTerminalStepASolutionFiles,
                    starterCode: linuxTerminalStepAStarterFiles["README.md"],
                    solutionCode: linuxTerminalStepASolutionFiles["README.md"],
                },
                {
                    id: "e2e-linux-command-practice",
                    title: "Make command practice",
                    starterFiles: linuxTerminalStepBStarterFiles,
                    solutionFiles: linuxTerminalStepBSolutionFiles,
                    starterCode: linuxTerminalStepBStarterFiles["README.md"],
                    solutionCode: linuxTerminalStepBSolutionFiles["README.md"],
                },
            ],
        }),
    ],
} satisfies ReviewModule["topics"][number];

const linuxTerminalCloneSection = {
    id: "e2e-terminal-section",
    slug: "e2e-terminal-section",
    title: "E2E Terminal Review Clone Section",
    summary: "A dev-only section for terminal workspace review tests.",
    description:
        "This clone intentionally reuses the actual review module page shell for terminal_workspace coverage.",
    order: 1,
    topics: [linuxTerminalCloneTopic],
} satisfies NonNullable<ReviewModule["sections"]>[number];

const linuxTerminalCloneModule: ReviewModule = {
    id: "e2e-terminal-review-clone",
    profileId: "generic",
    versionFamily: "linux",
    title: "E2E Terminal Review Module Clone",
    subtitle:
        "Dev-only clone that keeps terminal workspace review tests off the paywalled catalog path.",
    startPracticeSectionSlug: "e2e-terminal-section",
    runtimeDefaults: terminalCloneRuntimeDefaults,
    serviceDefaults: terminalCloneServiceDefaults,
    topics: [linuxTerminalCloneTopic],
    sections: [linuxTerminalCloneSection],
    contentVersion: null,
};

const reviewCloneSection = {
    id: "e2e-section",
    slug: "e2e-section",
    title: "E2E Review Clone Section",
    summary: "A dev-only section for testing the real review module page.",
    description:
        "This clone intentionally reuses the actual review module page shell.",
    order: 1,
    topics: [reviewCloneTopic],
} satisfies NonNullable<ReviewModule["sections"]>[number];

const reviewCloneModule: ReviewModule = {
    id: "e2e-review-clone",
    profileId: "python",
    versionFamily: "python",
    title: "E2E Real Review Module Clone",
    subtitle:
        "Dev-only clone that uses the real ReviewModulePageClient and review runtime path.",
    startPracticeSectionSlug: "e2e-section",
    runtimeDefaults,
    serviceDefaults: defaultServiceDefaults,
    topics: [reviewCloneTopic],
    sections: [reviewCloneSection],
    contentVersion: null,
};

type DevCloneSearchParams = Record<string, string | string[] | undefined>;

function searchParamIsTrue(
    searchParams: DevCloneSearchParams,
    key: string,
) {
    const value = searchParams[key];

    if (Array.isArray(value)) {
        return value.includes("1") || value.includes("true");
    }

    return value === "1" || value === "true";
}

function subjectWithoutDraftWrapper(subjectSlug: string) {
    const draftMatch = subjectSlug.match(/^([^/]+?)--(.+)--draft$/);
    if (draftMatch) return draftMatch[2] ?? subjectSlug;
    return subjectSlug.replace(/--draft$/, "");
}

function firstSearchParam(
    searchParams: DevCloneSearchParams,
    key: string,
) {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
}

function previewSource(searchParams: DevCloneSearchParams) {
    const raw = firstSearchParam(searchParams, "source");
    if (raw === "draft" || raw === "generated") return raw;
    return searchParamIsTrue(searchParams, "draftPreview") ? "generated" : null;
}

function allowGeneratedDraftPreview(searchParams: DevCloneSearchParams) {
    return (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_CURRICULUM_EDITOR === "1" &&
        previewSource(searchParams) === "generated"
    );
}

function allowRawDraftPreview(searchParams: DevCloneSearchParams) {
    return (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_CURRICULUM_EDITOR === "1" &&
        previewSource(searchParams) === "draft"
    );
}

export default async function Page({
                                       params,
                                       searchParams,
                                   }: {
    params?: Promise<{
        locale?: string;
        subjectSlug?: string;
        moduleSlug?: string;
        sectionSlug?: string;
        topicSlug?: string;
        targetKind?: string;
        targetSlug?: string;
    }>;
    searchParams?: Promise<DevCloneSearchParams>;
}) {
    if (
        process.env.NODE_ENV === "production" &&
        process.env.E2E_ALLOW_DEV_ROUTES !== "1"
    ) {
        notFound();
    }

    const resolvedParams = (await params) ?? {};
    const resolvedSearchParams = (await searchParams) ?? {};

    const progressiveLockMode = searchParamIsTrue(
        resolvedSearchParams,
        "progressive",
    );

    const isSqlClone =
        resolvedParams.subjectSlug === "sql" ||
        resolvedParams.moduleSlug === "e2e-sql-review-clone";
    const isLinuxTerminalClone =
        resolvedParams.subjectSlug === "linux" ||
        resolvedParams.moduleSlug === "e2e-terminal-review-clone";

    const selectedServiceDefaults = serviceDefaultsForBackend(
        resolveDevRunnerBackend(resolvedSearchParams),
    );

    const rawDraftPreview = allowRawDraftPreview(resolvedSearchParams);
    const draftPreviewModule = rawDraftPreview
        ? await buildDraftPreviewReviewModule({
            catalog:
                firstSearchParam(resolvedSearchParams, "catalog") ??
                String(resolvedParams.subjectSlug ?? "").split("--", 1)[0] ??
                "python",
            subject: firstSearchParam(resolvedSearchParams, "subject") ?? resolvedParams.subjectSlug ?? "",
            module: firstSearchParam(resolvedSearchParams, "moduleDir") ?? resolvedParams.moduleSlug ?? "",
            topic: firstSearchParam(resolvedSearchParams, "topicDir") ?? resolvedParams.topicSlug ?? "",
            locale: resolvedParams.locale ?? "en",
        })
        : null;

    const generatedDraftPreview = !draftPreviewModule && allowGeneratedDraftPreview(resolvedSearchParams);
    const generatedPreviewModule = generatedDraftPreview
        ? await getResolvedReviewModule(
            subjectWithoutDraftWrapper(resolvedParams.subjectSlug ?? ""),
            resolvedParams.moduleSlug ?? "",
        )
        : null;

    if (generatedDraftPreview && !generatedPreviewModule) {
        notFound();
    }

    const selectedModule = draftPreviewModule ?? generatedPreviewModule ?? (isSqlClone
        ? sqlReviewCloneModule
        : isLinuxTerminalClone
          ? cloneReviewModuleWithServiceDefaults(
                linuxTerminalCloneModule,
                terminalCloneServiceDefaults,
            )
        : cloneReviewModuleWithServiceDefaults(
            reviewCloneModule,
            selectedServiceDefaults,
        ));

    return (
        <>
            {isLinuxTerminalClone && process.env.NODE_ENV !== "production" ? (
                <textarea
                    data-testid="dev-clone-linux-terminal-contract-e2e-input"
                    aria-label="E2E Linux terminal clone resolved contract"
                    readOnly
                    value={JSON.stringify({
                        exerciseId: String((linuxTerminalCwdProjectStep as any)?.id ?? ""),
                        exerciseKey: String(
                            (linuxTerminalCwdProjectStep as any)?.exerciseKey ??
                                (linuxTerminalCwdProjectStep as any)?.id ??
                                "",
                        ),
                        language: "bash",
                        runtimeDefaults: terminalCloneRuntimeDefaults,
                        serviceDefaults: terminalCloneServiceDefaults,
                        ideConfig: linuxTerminalCwdIdeConfig,
                        recipe: {
                            ...linuxTerminalCwdRecipe,
                            terminalExpectations: {
                                ...(linuxTerminalCwdRecipe as any).terminalExpectations,
                                requiredCommands: [
                                    {
                                        command: "ls",
                                        message: "Use ls inside park-terminal-map.",
                                    },
                                ],
                            },
                        },
                        terminalCwd: E2E_TERMINAL_CWD,
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
            <ReviewModulePageClient
                canUnlockAll={Boolean(draftPreviewModule) || generatedDraftPreview || !progressiveLockMode}
                mod={selectedModule}
            />
        </>
    );
}
