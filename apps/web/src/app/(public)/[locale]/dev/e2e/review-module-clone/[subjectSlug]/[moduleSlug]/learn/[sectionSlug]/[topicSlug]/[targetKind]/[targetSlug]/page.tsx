import { notFound } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";

export const runtime = "nodejs";

const runtimeDefaults = {
    kind: "code",
    language: "python",
} as const;

const serviceDefaults = {
    preset: "runner",
    runnerBackend: "judge0",
    requires: {
        files: true,
        multiFile: true,
        terminal: false,
        projectPersistence: false,
        cloudProjects: false,
    },
} as const;

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

const fileIoStarterFiles = {
    "main.py": "# Write your answer below\n",
};

const fileIoSolutionFiles = {
    "main.py":
        "with open('data.txt', 'r') as file:\n    content = file.read()\n    print(content)\n",
    "data.txt": "Hello, World!\nThis is a test file.",
};

const fileIoWorkspaceFiles = [
    {
        path: "data.txt",
        content: "Hello, World!\nThis is a test file.",
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
    } as any,
    starterCode: fileIoStarterFiles["main.py"],
    solutionCode: fileIoSolutionFiles["main.py"],
};

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
                        ...(step.files?.length ? { files: step.files } : {}),
                    },
                    starterCode: step.starterCode,
                    solutionCode: step.solutionCode,
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

const reviewCloneTopic = {
    id: "e2e-review-topic",
    label: "E2E Review Topic",
    minutes: 5,
    summary:
        "A deterministic topic used to test the real review module page, route target sync, tools rail, progress save, and workspace restore.",
    meta: {
        runtimeDefaults,
        serviceDefaults,
        rawManifest: {
            exercises: [
                exerciseADefinition,
                exerciseBDefinition,
                blankFallbackExerciseDefinition,
                projectStep2Definition,
                projectStep3Definition,
                fileIoDefinition,
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
        reviewClonePracticeQuizCard,
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
    title: "E2E Real Review Module Clone",
    subtitle:
        "Dev-only clone that uses the real ReviewModulePageClient and review runtime path.",
    startPracticeSectionSlug: "e2e-section",
    runtimeDefaults,
    serviceDefaults,
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

    return (
        <ReviewModulePageClient
            canUnlockAll={!progressiveLockMode}
            mod={isSqlClone ? sqlReviewCloneModule : reviewCloneModule}
        />
    );
}
