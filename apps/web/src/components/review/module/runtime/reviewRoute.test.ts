import { describe, expect, it } from "vitest";
import { buildReviewExerciseRouteTarget, resolveReviewRouteTarget } from "./reviewRoute";

describe("resolveReviewRouteTarget", () => {
    const mod = {
        id: "python-6-functions-and-modularity",
        title: "Functions",
        startPracticeSectionSlug: "python-data-functions-python-6-function-design",
        topics: [
            {
                id: "using-imports-and-helper-files",
                label: "Topic",
                cards: [
                    {
                        type: "project",
                        id: "project",
                        spec: {
                            mode: "project",
                            subject: "python-data-functions",
                            steps: [
                                {
                                    id: "using-imports-create-name-module",
                                    topic: "using-imports-and-helper-files",
                                    exerciseKey: "using-imports-create-name-module",
                                },
                            ],
                        },
                    },
                ],
                meta: {
                    rawManifest: {
                        topicId: "using-imports-and-helper-files",
                        exercises: [
                            {
                                id: "using-imports-create-name-module",
                                kind: "code_input",
                            },
                        ],
                    },
                },
            },
        ],
        sections: [
            {
                id: "python-data-functions-python-6-function-design",
                slug: "python-data-functions-python-6-function-design",
                title: "Section",
                order: 1,
                topics: [
                    {
                        id: "using-imports-and-helper-files",
                        label: "Topic",
                        cards: [
                            {
                                type: "project",
                                id: "project",
                                spec: {
                                    mode: "project",
                                    subject: "python-data-functions",
                                    steps: [
                                        {
                                            id: "using-imports-create-name-module",
                                            topic: "using-imports-and-helper-files",
                                            exerciseKey: "using-imports-create-name-module",
                                        },
                                    ],
                                },
                            },
                        ],
                        meta: {
                            rawManifest: {
                                topicId: "using-imports-and-helper-files",
                                exercises: [
                                    {
                                        id: "using-imports-create-name-module",
                                        kind: "code_input",
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
        ],
    } as any;

    it("returns null for an explicit broken exercise route instead of falling back", () => {
        const resolved = resolveReviewRouteTarget({
            mod,
            subjectSlug: "python-data-functions",
            moduleSlug: "python-6-functions-and-modularity",
            route: {
                sectionSlug: "python-data-functions-python-6-function-design",
                topicSlug: "using-imports-and-helper-files",
                targetKind: "exercise",
                targetSlug: "missing-project-step",
            },
        });

        expect(resolved).toBeNull();
    });

    it("builds a project exercise route target from the compiled bundle when rawManifest is absent", () => {
        const modWithoutRawManifest = {
            ...mod,
            topics: [
                {
                    id: "using-imports-and-helper-files",
                    label: "Topic",
                    cards: mod.topics[0].cards,
                    meta: null,
                },
            ],
            sections: [
                {
                    ...mod.sections[0],
                    topics: [
                        {
                            id: "using-imports-and-helper-files",
                            label: "Topic",
                            cards: mod.sections[0].topics[0].cards,
                            meta: null,
                        },
                    ],
                },
            ],
        } as any;

        const target = buildReviewExerciseRouteTarget({
            mod: modWithoutRawManifest,
            topicId: "using-imports-and-helper-files",
            cardId: "project",
            exerciseId: "using-imports-create-name-module",
            subjectSlug: "python-data-functions",
            moduleSlug: "python-6-functions-and-modularity",
            sectionSlug: "python-data-functions-python-6-function-design",
        });

        expect(target).toMatchObject({
            kind: "exercise",
            cardId: "project",
            exerciseId: "using-imports-create-name-module",
            targetSlug: "using-imports-create-name-module",
        });
    });

    it("round-trips a project step when its route id differs from its exercise key", () => {
        const topic = {
            id: "commit-a-prepared-snapshot",
            label: "Topic",
            cards: [
                {
                    type: "project",
                    id: "project",
                    spec: {
                        mode: "project",
                        subject: "git-foundations",
                        steps: [
                            {
                                id: "record-the-volunteer-snapshot",
                                topic: "commit-a-prepared-snapshot",
                                exerciseKey: "commit-prepared-two-file-snapshot",
                            },
                        ],
                    },
                },
            ],
            meta: {
                rawManifest: {
                    topicId: "commit-a-prepared-snapshot",
                    exercises: [
                        {
                            id: "commit-prepared-two-file-snapshot",
                            kind: "code_input",
                        },
                    ],
                },
            },
        };
        const routeModule = {
            id: "git-foundations-module-1-start-tracking",
            title: "Start tracking",
            startPracticeSectionSlug: "repository-basics",
            topics: [topic],
            sections: [
                {
                    id: "repository-basics",
                    slug: "repository-basics",
                    title: "Repository basics",
                    order: 1,
                    topics: [topic],
                },
            ],
        } as any;

        const built = buildReviewExerciseRouteTarget({
            mod: routeModule,
            topicId: "commit-a-prepared-snapshot",
            cardId: "project",
            exerciseId: "commit-prepared-two-file-snapshot",
            subjectSlug: "git-foundations",
            moduleSlug: "git-foundations-module-1-start-tracking",
        });

        expect(built).toMatchObject({
            exerciseId: "commit-prepared-two-file-snapshot",
            targetSlug: "record-the-volunteer-snapshot",
        });

        const resolved = resolveReviewRouteTarget({
            mod: routeModule,
            subjectSlug: "git-foundations",
            moduleSlug: "git-foundations-module-1-start-tracking",
            route: built,
        });

        expect(resolved).toMatchObject({
            exerciseId: "commit-prepared-two-file-snapshot",
            targetSlug: "record-the-volunteer-snapshot",
        });
    });

    it("resolves legacy numbered project exercise aliases against the compiled topic manifest", () => {
        const manifestWithNumberedAliases = {
            topicId: "using-imports-and-helper-files",
            exercises: [
                { id: "q1", kind: "single_choice" },
                { id: "q2", kind: "single_choice" },
                { id: "q3", kind: "single_choice" },
                { id: "q4", kind: "single_choice" },
                { id: "q5", kind: "single_choice" },
                { id: "q6", kind: "single_choice" },
                { id: "q7", kind: "single_choice" },
                { id: "q8", kind: "single_choice" },
                { id: "using-imports-create-name-module", kind: "code_input" },
            ],
        };
        const modWithAliasManifest = {
            ...mod,
            topics: [
                {
                    ...mod.topics[0],
                    meta: {
                        rawManifest: manifestWithNumberedAliases,
                    },
                },
            ],
            sections: [
                {
                    ...mod.sections[0],
                    topics: [
                        {
                            ...mod.sections[0].topics[0],
                            meta: {
                                rawManifest: manifestWithNumberedAliases,
                            },
                        },
                    ],
                },
            ],
        } as any;

        const resolved = resolveReviewRouteTarget({
            mod: modWithAliasManifest,
            subjectSlug: "python-data-functions",
            moduleSlug: "python-6-functions-and-modularity",
            route: {
                sectionSlug: "python-data-functions-python-6-function-design",
                topicSlug: "using-imports-and-helper-files",
                targetKind: "exercise",
                targetSlug: "quiz9",
            },
        });

        expect(resolved).toMatchObject({
            kind: "exercise",
            cardId: "project",
            exerciseId: "quiz9",
            targetSlug: "quiz9",
        });

        const built = buildReviewExerciseRouteTarget({
            mod: modWithAliasManifest,
            topicId: "using-imports-and-helper-files",
            cardId: "project",
            exerciseId: "quiz9",
            subjectSlug: "python-data-functions",
            moduleSlug: "python-6-functions-and-modularity",
            sectionSlug: "python-data-functions-python-6-function-design",
        });

        expect(built).toMatchObject({
            kind: "exercise",
            exerciseId: "quiz9",
            targetSlug: "quiz9",
        });
    });
});
