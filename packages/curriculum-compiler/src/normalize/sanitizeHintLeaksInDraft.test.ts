import { afterEach, describe, expect, it } from "vitest";
import {
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { sanitizeHintLeaksInDraft } from "./sanitizeHintLeaksInDraft.js";

afterEach(() => {
    unregisterCurriculumProfile("testlang");
});

describe("sanitizeHintLeaksInDraft", () => {
    it("uses SQL workspace language for repaired code_input help", () => {
        const repaired = sanitizeHintLeaksInDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Query students",
                        prompt: "Write a query that lists student names.",
                        hint: "Use SELECT name FROM students to answer the question.",
                        help: {
                            concept: "SELECT name FROM students returns the result.",
                            hint_1: "Use the Python statement or expression that matches the required output.",
                            hint_2: "Run the script in the terminal.",
                        },
                        starterCode: "SELECT * FROM students;",
                        solutionCode: "SELECT name FROM students;",
                        recipeType: "sql_query",
                        datasetId: "students_intro",
                    },
                ],
            } as any,
            {
                profileId: "sql",
                workspacePolicy: {
                    workspace: {
                        ui: {
                            editorLabel: "SQL editor",
                            runButtonLabel: "Run query",
                            resultsTableLabel: "results table",
                        },
                    },
                },
            } as any,
        );

        const help = repaired.quizDraft[0].help;
        const combined = [repaired.quizDraft[0].hint, help.concept, help.hint_1, help.hint_2].join(" ");

        expect(combined).not.toMatch(/Python|program output|script|terminal|\.py/i);
        expect(combined).toMatch(/SQL editor|query|results table|Run query/i);
    });

    it("repairs fill_blank hints that mention the exact answer value", () => {
        const repaired = sanitizeHintLeaksInDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "blank-1",
                        kind: "fill_blank_choice",
                        title: "Clause keyword",
                        prompt: "Fill in the missing keyword.",
                        hint: "Use FROM here.",
                        help: {
                            concept: "The answer is FROM because it introduces the table.",
                            hint_1: "The missing keyword is FROM.",
                            hint_2: "Choose FROM.",
                        },
                        template: "SELECT name [blank1] students;",
                        choices: ["FROM", "WHERE", "ORDER BY", "TABLE"],
                        correctValue: "FROM",
                    },
                ],
            } as any,
            {
                profileId: "sql",
            } as any,
        );

        const exercise = repaired.quizDraft[0] as any;
        const combined = [
            exercise.hint,
            exercise.help.concept,
            exercise.help.hint_1,
            exercise.help.hint_2,
        ].join(" ");

        expect(combined).not.toMatch(/\bFROM\b/);
        expect(combined).toMatch(/missing concept|missing part|missing term|statement/i);
    });

    it("uses profile-owned fallback help wording for custom profiles", () => {
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
                getHelpFallback() {
                    return {
                        hint: "Use the testlang runner pattern from the lesson.",
                        help: {
                            concept: "This testlang exercise checks the expected behavior in the testlang runner.",
                            hint_1: "Write the needed expression in the testlang pad.",
                            hint_2: "Click Execute and compare the result panel.",
                        },
                    };
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

        const repaired = sanitizeHintLeaksInDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Custom task",
                        prompt: "Prompt",
                        hint: "print ok now",
                        help: {
                            concept: "print ok in testlang",
                            hint_1: "print ok",
                            hint_2: "print ok exactly",
                        },
                        starterCode: "// todo",
                        solutionCode: "print ok",
                    },
                ],
            } as any,
            {
                profileId: "testlang",
            } as any,
        );

        const exercise = repaired.quizDraft[0] as any;
        const combined = [
            exercise.hint,
            exercise.help.concept,
            exercise.help.hint_1,
            exercise.help.hint_2,
        ].join(" ");

        expect(combined).toContain("testlang");
        expect(combined).toContain("Execute");
        expect(combined).toContain("result panel");
    });
});
