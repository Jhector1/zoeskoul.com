import { describe, expect, it } from "vitest";
import { buildSharedPracticeCompletenessIssues } from "./buildSharedPracticeCompletenessIssues.js";

function makeSeed(overrides: Record<string, unknown> = {}) {
    return {
        profileId: "python",
        title: "Variables",
        topicId: "variables",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "lesson-1",
        sourceLocale: "en",
        targetLocales: [],
        order: 1,
        summary: "Learn variables.",
        minutes: 15,
        moduleTitle: "Module 1",
        moduleObjectives: [],
        guidedExercises: [],
        quizFocus: [],
        sectionTitle: "Lesson 1",
        modulePrefix: "topics.python-v2.python-v2-1.variables",
        moduleOrder: 1,
        sectionOrder: 1,
        practice: {
            tryIt: true,
            requiresTryIt: true,
            tryItPlacement: "all_sketches",
        },
        ...overrides,
    } as any;
}

function codeInput(id: string, prompt = `Create the learner output for ${id}.`) {
    return {
        id,
        kind: "code_input",
        title: `Exercise ${id}`,
        prompt,
        hint: "Use the task details.",
        help: {
            concept: "Concept",
            hint_1: "Hint 1",
            hint_2: "Hint 2",
        },
        starterCode: "print('start')\n",
        solutionCode: "print('done')\n",
        tests: [
            { stdout: "done\n", match: "exact" },
            { stdout: "done\n", match: "exact" },
        ],
    } as any;
}

describe("buildSharedPracticeCompletenessIssues", () => {
    it("flags generic try-it messages", () => {
        const issues = buildSharedPracticeCompletenessIssues({
            seed: makeSeed({
                practice: {
                    tryIt: true,
                    requiresTryIt: true,
                    tryItPlacement: "first_sketch",
                },
            }),
            draft: {
                title: "Variables",
                summary: "Learn variables.",
                minutes: 15,
                sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Body" }],
                quizDraft: [codeInput("ex1", "Complete the exercise.")],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain("TRY_IT_GENERIC_MESSAGE");
    });

    it("requires every hands-on sketch to resolve to a concrete Try It exercise", () => {
        const issues = buildSharedPracticeCompletenessIssues({
            seed: makeSeed(),
            draft: {
                title: "Variables",
                summary: "Learn variables.",
                minutes: 15,
                sketchBlocks: [
                    { id: "s1", title: "Sketch 1", bodyMarkdown: "Body" },
                    { id: "s2", title: "Sketch 2", bodyMarkdown: "Body" },
                ],
                quizDraft: [codeInput("ex1", "Create a customer label for sketch one.")],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain("TRY_IT_SKETCH_EXERCISE_MISSING");
    });

    it("rejects incomplete multi-file reveal/fill solutions", () => {
        const issues = buildSharedPracticeCompletenessIssues({
            seed: makeSeed({
                practice: {
                    tryIt: true,
                    requiresTryIt: true,
                    tryItPlacement: "first_sketch",
                },
            }),
            draft: {
                title: "Multi-file task",
                summary: "Use helpers.",
                minutes: 15,
                sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Body" }],
                quizDraft: [
                    {
                        ...codeInput("multi", "Update the report app and helper file for the client."),
                        starterFiles: [
                            { path: "app.py", content: "from helpers import name\n", language: "python", isEntry: true },
                            { path: "helpers.py", content: "def name():\n    return 'Ava'\n", language: "python" },
                        ],
                        solutionFiles: [
                            { path: "app.py", content: "from helpers import name\nprint(name())\n", language: "python", isEntry: true },
                        ],
                    },
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain("MULTI_FILE_SOLUTION_FILES_INCOMPLETE");
    });

    it("rejects generic project titles and missing real-world scenario context", () => {
        const issues = buildSharedPracticeCompletenessIssues({
            seed: makeSeed({
                sectionRole: "module_project",
                authoringPolicy: {
                    projectRequirements: {
                        requireRealWorldStory: true,
                    },
                },
                practice: {
                    tryIt: false,
                    requiresTryIt: false,
                    projectFlow: "progressive",
                },
            }),
            draft: {
                title: "Module Project",
                summary: "Build the project.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [],
                projectDraft: {
                    title: "Module Project",
                    stepIds: [],
                },
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining([
                "PROJECT_STORY_CONTEXT_MISSING",
                "PROJECT_REAL_WORLD_SCENARIO_MISSING",
            ]),
        );
    });
});
