import { afterEach, describe, expect, it } from "vitest";
import {
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";

afterEach(() => {
    unregisterCurriculumProfile("testlang");
});

describe("normalizeTopicAuthoringDraft", () => {
    it("normalizes missing arrays and trims basic strings", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "  Topic  ",
            summary: "  Summary  ",
            minutes: 15,
            sketchBlocks: undefined,
            quizDraft: undefined,
        } as any);

        expect(normalized.title).toBe("Topic");
        expect(normalized.summary).toBe("Summary");
        expect(Array.isArray(normalized.sketchBlocks)).toBe(true);
        expect(Array.isArray(normalized.quizDraft)).toBe(true);
    });

    it("preserves minutes when already numeric", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [],
        } as any);

        expect(normalized.minutes).toBe(20);
    });

    it("normalizes programming code_input tests", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input",
                    title: "Code",
                    prompt: "Prompt",
                    starterCode: "n = int(input())\n",
                    solutionCode: "n = int(input())\nprint(n + 1)\n",
                    tests: [
                        { stdin: "3\n", stdout: "4\n", match: "exact" },
                        { stdin: "5\n", stdout: "" },
                    ],
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.tests).toEqual([
            { stdin: "3\n", stdout: "4\n", match: "exact" },
        ]);
    });

    it("preserves workspaceExpectations for code_input exercises", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input",
                    title: "Code",
                    prompt: "Prompt",
                    starterCode: "# start\n",
                    solutionCode: "print('ok')\n",
                    workspaceExpectations: {
                        requiredFiles: ["helpers/formatting.py"],
                        requiredFolders: ["helpers"],
                    },
                    tests: [
                        { stdout: "ok\n", match: "exact" },
                    ],
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.workspaceExpectations).toEqual({
            requiredFiles: ["helpers/formatting.py"],
            requiredFolders: ["helpers"],
        });
    });

    it("throws on unsafe workspaceExpectations paths", () => {
        expect(() =>
            normalizeTopicAuthoringDraft({
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        workspaceExpectations: {
                            requiredFiles: ["../secret.txt"],
                        },
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any),
        ).toThrow(/workspace|path|unsafe|invalid/i);
    });

    it("uses the Python profile for default starter code", () => {
        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        starterCode: "",
                        solutionCode: "print(1)\n",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
            { profileId: "python" },
        );

        expect((normalized.quizDraft[0] as any).starterCode).toBe(
            "# Write your answer below\n",
        );
    });

    it("uses the SQL profile for default starter code", () => {
        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        starterCode: "",
                        solutionCode: "SELECT 1;",
                        recipeType: "sql_query",
                        datasetId: "students_intro",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
            { profileId: "sql" },
        );

        expect((normalized.quizDraft[0] as any).starterCode).toBe(
            "-- Write your SQL answer below\n",
        );
    });

    it("uses a registered profile for default starter code", () => {
        const testlangProfile: CourseProfile = {
            id: "testlang",
            shape: {
                ...pythonShape,
                profileId: "testlang",
            },
            allowedExerciseKinds: ["code_input"],
            allowedRecipeTypes: ["fixed_tests"],
            buildModuleRuntimeDefaults() {
                return { kind: "code", language: "testlang" };
            },
            codeInput: {
                defaultStarter() {
                    return "// Write your testlang answer below\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest() {
                    throw new Error("Not needed");
                },
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };
        registerCurriculumProfile(testlangProfile);

        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        starterCode: "",
                        solutionCode: "print ok\n",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
            { profileId: "testlang" },
        );

        expect((normalized.quizDraft[0] as any).starterCode).toBe(
            "// Write your testlang answer below\n",
        );
    });

    it("preserves explicit starterCode without requiring profile context", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input",
                    title: "Code",
                    prompt: "Prompt",
                    starterCode: "custom starter\n",
                    solutionCode: "print ok\n",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                },
            ],
        } as any);

        expect((normalized.quizDraft[0] as any).starterCode).toBe("custom starter\n");
    });

    it("throws when blank starterCode is normalized without profile context", () => {
        expect(() =>
            normalizeTopicAuthoringDraft({
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        starterCode: "",
                        solutionCode: "print ok\n",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any),
        ).toThrow(
            "Cannot create default starterCode for code_input without a curriculum profile. Pass profileId so starter defaults stay profile-owned.",
        );
    });

    it("fails loudly when profile context is provided but unknown", () => {
        expect(() =>
            normalizeTopicAuthoringDraft(
                {
                    title: "Topic",
                    summary: "Summary",
                    minutes: 20,
                    sketchBlocks: [],
                    quizDraft: [
                        {
                            id: "code-1",
                            kind: "code_input",
                            title: "Code",
                            prompt: "Prompt",
                            starterCode: "",
                            solutionCode: "print ok\n",
                            hint: "Hint",
                            help: {
                                concept: "Concept",
                                hint_1: "Hint 1",
                                hint_2: "Hint 2",
                            },
                        },
                    ],
                } as any,
                { profileId: "missinglang" },
            ),
        ).toThrow(
            "Unknown curriculum profile: missinglang. Register a profile adapter before compiling.",
        );
    });

    it("does not let language, recipeType, or datasetId steal starter ownership from the profile", () => {
        const testlangProfile: CourseProfile = {
            id: "testlang",
            shape: {
                ...pythonShape,
                profileId: "testlang",
            },
            allowedExerciseKinds: ["code_input"],
            allowedRecipeTypes: ["fixed_tests", "sql_query"],
            buildModuleRuntimeDefaults() {
                return { kind: "code", language: "testlang" };
            },
            codeInput: {
                defaultStarter() {
                    return "TESTLANG STARTER\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest() {
                    throw new Error("Not needed");
                },
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };
        registerCurriculumProfile(testlangProfile);

        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        language: "python",
                        recipeType: "sql_query",
                        datasetId: "some_dataset",
                        starterCode: "",
                        solutionCode: "print ok\n",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
            { profileId: "testlang" },
        );

        expect((normalized.quizDraft[0] as any).starterCode).toBe("TESTLANG STARTER\n");
    });

    it("fails loudly when a profile without code_input support receives a code_input exercise", () => {
        expect(() =>
            normalizeTopicAuthoringDraft(
                {
                    title: "Topic",
                    summary: "Summary",
                    minutes: 20,
                    sketchBlocks: [],
                    quizDraft: [
                        {
                            id: "code-1",
                            kind: "code_input",
                            title: "Code",
                            prompt: "Prompt",
                            starterCode: "custom starter\n",
                            solutionCode: "print ok\n",
                            hint: "Hint",
                            help: {
                                concept: "Concept",
                                hint_1: "Hint 1",
                                hint_2: "Hint 2",
                            },
                        },
                    ],
                } as any,
                { profileId: "math" },
            ),
        ).toThrow('Profile "math" does not support code_input exercises.');
    });
});
