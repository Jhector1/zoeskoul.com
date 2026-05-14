import { notFound } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import type { ReviewModule } from "@/lib/subjects/types";

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

const starterFiles = {
    "main.py": "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
    "helper.py": "def shout(value):\n    return value.upper()\n",
};

const solutionFiles = {
    "main.py":
        "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
    "helper.py": "def shout(value):\n    return value.upper()\n",
};

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
                {
                    id: "e2e-print-name",
                    title: "Print a name",
                    runtime: runtimeDefaults,
                    workspace: {
                        language: "python",
                        entryFile: "main.py",
                        starterFiles,
                        solutionFiles,
                    },
                    starterCode: starterFiles["main.py"],
                    solutionCode: solutionFiles["main.py"],
                },
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
        {
            type: "project",
            id: "review-clone-project",
            title: "Review Clone Project",
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
                steps: [
                    {
                        id: "e2e-print-name",
                        title: "Edit and run starter code",
                        exerciseKey: "e2e-print-name",
                        topic: "e2e-review-topic",
                        difficulty: "easy",
                        preferKind: "code_input",
                        maxAttempts: 3,

                        /**
                         * The real review runtime accepts richer local step metadata than
                         * ReviewProjectStep currently types. Keep this local clone realistic
                         * while allowing the top-level ReviewModule object to stay type-safe.
                         */
                        runtime: runtimeDefaults,
                        workspace: {
                            language: "python",
                            entryFile: "main.py",
                            starterFiles,
                            solutionFiles,
                        },
                        starterCode: starterFiles["main.py"],
                        solutionCode: solutionFiles["main.py"],
                    } as any,
                ],
            },
        },
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

export default async function Page() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }

    return <ReviewModulePageClient canUnlockAll mod={reviewCloneModule} />;
}