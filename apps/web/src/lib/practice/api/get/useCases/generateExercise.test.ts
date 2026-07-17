import { describe, expect, it, vi, beforeEach } from "vitest";

const getExerciseWithExpectedMock = vi.hoisted(() => vi.fn());
const resolveTopicBundleManifestMock = vi.hoisted(() => vi.fn());
const resolveManifestExerciseMock = vi.hoisted(() => vi.fn());
const buildExerciseFromManifestMock = vi.hoisted(() => vi.fn());
const createPracticeInstanceMock = vi.hoisted(() => vi.fn());
const signKeyMock = vi.hoisted(() => vi.fn());
const buildRunMetaMock = vi.hoisted(() => vi.fn());
const resolveTopicFromScopeMock = vi.hoisted(() => vi.fn());
const loadPracticeTopicI18nMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/practice/catalog", () => ({
    DIFFICULTIES: ["easy", "medium", "hard"],
    rngFromActor: vi.fn(() => ({
        pick: (values: string[]) => values[0],
    })),
}));

vi.mock("@/lib/practice/generator", () => ({
    getExerciseWithExpected: getExerciseWithExpectedMock,
}));

vi.mock("@/lib/practice/generator/engines/json/buildExerciseFromManifest", () => ({
    buildExerciseFromManifest: buildExerciseFromManifestMock,
}));

vi.mock("@/i18n/loadPracticeTopicI18n", () => ({
    loadPracticeTopicI18n: loadPracticeTopicI18nMock,
}));

vi.mock("@/lib/curriculum/resolveManifestExercise", () => ({
    resolveManifestExercise: resolveManifestExerciseMock,
}));

vi.mock("@/lib/curriculum/resolveTopicBundleManifest", () => ({
    resolveTopicBundleManifest: resolveTopicBundleManifestMock,
}));

vi.mock("../repositories/instance.repo", () => ({
    createPracticeInstance: createPracticeInstanceMock,
}));

vi.mock("../mappers/key.mapper", () => ({
    signKey: signKeyMock,
}));

vi.mock("../policies/runMeta.policy", () => ({
    buildRunMetaWithChallengeAttempts: buildRunMetaMock,
}));

vi.mock("../services/topicResolver.service", () => ({
    resolveTopicFromScope: resolveTopicFromScopeMock,
}));

import {
    generatePracticeExercise,
    openPracticeInstanceMatchesRequestedExercise,
} from "./generateExercise";

describe("generatePracticeExercise authored project resolution", () => {
    beforeEach(() => {
        resolveTopicBundleManifestMock.mockReset();
        resolveManifestExerciseMock.mockReset();
        buildExerciseFromManifestMock.mockReset();
        getExerciseWithExpectedMock.mockReset();
        createPracticeInstanceMock.mockReset();
        signKeyMock.mockReset();
        buildRunMetaMock.mockReset();
        resolveTopicFromScopeMock.mockReset();
        loadPracticeTopicI18nMock.mockReset();

        resolveTopicFromScopeMock.mockResolvedValue({
            kind: "ok",
            topicSlug: "py6.using-imports-and-helper-files",
            topicId: "using-imports-and-helper-files",
            genKey: "py6",
            variant: null,
            meta: null,
        });

        resolveTopicBundleManifestMock.mockReturnValue({
            topicId: "using-imports-and-helper-files",
            runtimeDefaults: { kind: "code", language: "python" },
            exercises: [{ id: "using-imports-create-name-module", kind: "code_input" }],
        });

        resolveManifestExerciseMock.mockReturnValue({
            id: "using-imports-create-name-module",
            kind: "code_input",
            messageBase: "topics.python-data-functions.python-6-functions-and-modularity.using-imports-and-helper-files.projectSteps.using-imports-create-name-module",
        });

        buildExerciseFromManifestMock.mockReturnValue({
            exercise: {
                id: "using-imports-create-name-module",
                kind: "code_input",
                title: "Create a name-cleaning module",
                prompt: "Prompt from manifest",
            },
            expected: { kind: "programming" },
        });

        createPracticeInstanceMock.mockResolvedValue({
            id: "instance-1",
            sessionId: "session-1",
        });

        signKeyMock.mockReturnValue("signed-key");
        buildRunMetaMock.mockReturnValue({ allowReveal: true });
    });

    it("uses the session subject slug when request subject is absent", async () => {
        const result = await generatePracticeExercise(
            {
                prisma: {
                    practiceQuestionInstance: {
                        findFirst: vi.fn().mockResolvedValue(null),
                    },
                } as any,
                actor: { userId: "user-1", guestId: null } as any,
                locale: "en",
                params: {
                    module: "python-6-functions-and-modularity",
                    section: "python-data-functions-python-6-function-design",
                    topic: "py6.using-imports-and-helper-files",
                    difficulty: "easy",
                    exerciseKey: "using-imports-create-name-module",
                    preferPurpose: "project",
                    seedPolicy: "global",
                } as any,
                session: {
                    id: "session-1",
                    mode: "assignment",
                    difficulty: "easy",
                    assignmentId: null,
                    section: {
                        slug: "python-data-functions-python-6-function-design",
                        subjectId: "subject-1",
                        moduleId: "module-1",
                        subject: {
                            slug: "python-data-functions",
                        },
                    },
                } as any,
            },
            {
                ok: true,
                effective: "project",
                requested: "project",
                allowed: ["project"],
                policy: "strict",
                source: "request",
                reason: null,
            } as any,
        );

        expect(resolveTopicBundleManifestMock).toHaveBeenCalledWith({
            subjectSlug: "python-data-functions",
            topicSlugOrId: "py6.using-imports-and-helper-files",
        });
        expect(result).toMatchObject({
            kind: "json",
            status: 200,
        });
        expect(getExerciseWithExpectedMock).not.toHaveBeenCalled();
    });

    it("uses the manifest topic slug for bundle lookup instead of an opaque DB topic id", async () => {
        resolveTopicFromScopeMock.mockResolvedValue({
            kind: "ok",
            topicSlug: "py6.using-imports-and-helper-files",
            topicId: "cmporycx8001hbecg7qsdrnpq",
            genKey: "py6",
            variant: null,
            meta: null,
        });

        await generatePracticeExercise(
            {
                prisma: {} as any,
                actor: { userId: "user-1", guestId: null } as any,
                locale: "en",
                params: {
                    subject: "python-data-functions",
                    module: "python-6-functions-and-modularity",
                    section: "python-data-functions-python-6-function-design",
                    topic: "py6.using-imports-and-helper-files",
                    difficulty: "easy",
                    exerciseKey: "using-imports-add-badge-module",
                    preferPurpose: "project",
                    seedPolicy: "global",
                } as any,
                session: null,
            },
            {
                ok: true,
                effective: "project",
                requested: "project",
                allowed: ["project"],
                policy: "strict",
                source: "request",
                reason: null,
            } as any,
        );

        expect(resolveTopicBundleManifestMock).toHaveBeenCalledWith({
            subjectSlug: "python-data-functions",
            topicSlugOrId: "py6.using-imports-and-helper-files",
        });
        expect(getExerciseWithExpectedMock).not.toHaveBeenCalled();
    });
    it("does not reuse an open instance for a different exact exercise key", () => {
        expect(
            openPracticeInstanceMatchesRequestedExercise(
                { exerciseKey: "try-current" },
                "try-current",
            ),
        ).toBe(true);

        expect(
            openPracticeInstanceMatchesRequestedExercise(
                { exerciseKey: "try-previous" },
                "try-current",
            ),
        ).toBe(false);
    });

});
