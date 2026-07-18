
import { describe, expect, it } from "vitest";
import { repairTopicAuthoringDraft } from "./repairTopicAuthoringDraft.js";

describe("repairTopicAuthoringDraft", () => {
    it("canonicalizes fill_blank correctValue to an actual choice string", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Fill",
                    prompt: "Which term completes the statement?",
                    hint: "Think about filtering rows.",
                    help: {
                        concept: "Filtering uses a SQL clause.",
                        hint_1: "This clause comes before a condition.",
                        hint_2: "Choose the clause that filters rows.",
                    },
                    template: "SELECT * FROM users ___ age > 18",
                    choices: ["WHERE", "ORDER BY"],
                    correctValue: " where ",
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctValue).toBe("WHERE");
    });

    it("ensures multi_choice has at least one correctOptionIds fallback", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "multi-1",
                    kind: "multi_choice",
                    title: "Multi",
                    prompt: "Pick all valid SQL clauses.",
                    hint: "Think about SQL clauses.",
                    help: {
                        concept: "Some options are valid clauses.",
                        hint_1: "Pick one or more valid ones.",
                        hint_2: "Choose all that apply.",
                    },
                    options: ["SELECT", "BANANA"],
                    correctOptionIds: [],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctOptionIds.length).toBeGreaterThanOrEqual(1);
    });

    it("replaces leaked choice hints with safe generic hint text", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "Single",
                    prompt: "Pick the SQL clause used to filter rows.",
                    hint: "Use WHERE.",
                    help: {
                        concept: "The answer is WHERE.",
                        hint_1: "Think about WHERE.",
                        hint_2: "Choose WHERE.",
                    },
                    options: ["WHERE", "GROUP BY"],
                    correctOptionIds: ["a"],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.hint).not.toMatch(/where/i);
        expect(exercise.help.concept).not.toMatch(/where/i);
    });

    it("injects authored project facts into a project synopsis deterministically", () => {
        const seed = {
            profileId: "sql",
            moduleRole: "standard",
            sectionRole: "module_project",
            projectBrief: {
                scenario:
                    "An inventory audit found incorrect prices, unfinished statuses, and internal test rows. Operations needs a cleanup script that changes only confirmed records.",
                role: "Inventory data steward",
                workspace:
                    "Browser SQL editor with one entry file named query.sql and the inventory_items table",
                deliverable:
                    "One cumulative query.sql correction-and-cleanup script that previews targets, applies scoped updates, removes confirmed test rows, and verifies preserved inventory.",
                stepCountTarget: 6,
            },
        } as any;

        const draft = {
            title: "Module 1 Project: Inventory Correction and Cleanup",
            summary: "Correct audited inventory values.",
            minutes: 70,
            sketchBlocks: [
                {
                    id: "sketch-1",
                    title: "Inventory Correction and Cleanup",
                    bodyMarkdown:
                        "You are responsible for cleaning up an inventory database after an audit.",
                },
            ],
            quizDraft: [],
            projectDraft: {
                title: "Inventory Correction and Cleanup",
                stepIds: [],
            },
        } as any;

        const repaired = repairTopicAuthoringDraft(draft, seed);
        const body = repaired.sketchBlocks[0]?.bodyMarkdown ?? "";

        expect(body).toContain("### Project Brief");
        expect(body).toContain("**Scenario:**");
        expect(body).toContain("Inventory data steward");
        expect(body).toContain("query.sql");
        expect(body).toContain("inventory_items");
        expect(body).toContain("**Deliverable:**");

        const repairedAgain = repairTopicAuthoringDraft(repaired, seed);
        const repeatedBody = repairedAgain.sketchBlocks[0]?.bodyMarkdown ?? "";

        expect(
            repeatedBody.match(/### Project Brief/g),
        ).toHaveLength(1);
    });

    it("collapses model-generated project step sketches into one authored synopsis", () => {
        const stepIds = Array.from({ length: 6 }, (_, index) => `step-${index + 1}`);
        const repaired = repairTopicAuthoringDraft(
            {
                title: "Neighborhood Resource Guide History",
                summary: "Prepare a trustworthy handoff.",
                minutes: 120,
                sketchBlocks: [
                    {
                        id: "intro",
                        title: "Welcome to the Final Capstone",
                        bodyMarkdown: [
                            "A neighborhood help desk needs a maintained resource guide.",
                            "### Project Brief",
                            "**Scenario:** A neighborhood help desk needs a maintained resource guide.",
                            "**Your role:** Junior developer",
                            "**Workspace:** One cumulative terminal workspace",
                            "**Deliverable:** A six-step local Git history",
                        ].join("\n\n"),
                    },
                    ...stepIds.map((id, index) => ({
                        id: `${id}-sketch`,
                        title: `Step ${index + 1}`,
                        bodyMarkdown: `Worked example for project step ${index + 1}.`,
                    })),
                ],
                quizDraft: stepIds.map((id) => ({
                    id,
                    kind: "code_input",
                    title: id,
                    prompt: `Complete ${id}.`,
                    hint: "Use the project brief.",
                    help: { concept: "Project step", hint_1: "Inspect state.", hint_2: "Complete the requested change." },
                    starterCode: "# starter\n",
                    solutionCode: "git status\n",
                })),
                projectDraft: {
                    title: "Neighborhood Resource Guide History",
                    stepIds,
                },
            } as any,
            {
                profileId: "git",
                sectionRole: "capstone",
                moduleRole: "capstone",
                projectBrief: {
                    scenario: "A neighborhood help desk needs a maintained resource guide.",
                    role: "Junior developer",
                    workspace: "One cumulative terminal workspace",
                    deliverable: "A six-step local Git history",
                    stepCountTarget: 6,
                },
            } as any,
        );

        expect(repaired.sketchBlocks).toHaveLength(1);
        expect(repaired.sketchBlocks[0]?.id).toBe("intro");
        expect(repaired.projectDraft?.stepIds).toEqual(stepIds);
        expect(repaired.quizDraft).toHaveLength(6);
    });

    it("creates a project synopsis sketch when authoring supplies a brief but the model omits the sketch", () => {
        const repaired = repairTopicAuthoringDraft(
            {
                title: "Warehouse Launch",
                summary: "Prepare a warehouse database.",
                minutes: 45,
                sketchBlocks: [],
                quizDraft: [],
                projectDraft: {
                    title: "Warehouse Launch",
                    stepIds: [],
                },
            } as any,
            {
                profileId: "sql",
                sectionRole: "capstone",
                projectBrief: {
                    scenario:
                        "A warehouse operations team needs a reliable launch database.",
                    role: "Database operations specialist",
                    workspace:
                        "schema.sql, seed.sql, and query.sql",
                    deliverable:
                        "A complete launch-ready SQL workspace.",
                    stepCountTarget: 6,
                },
            } as any,
        );

        expect(repaired.sketchBlocks).toHaveLength(1);
        expect(repaired.sketchBlocks[0]?.bodyMarkdown).toContain(
            "warehouse operations team",
        );
        expect(repaired.sketchBlocks[0]?.bodyMarkdown).toContain(
            "schema.sql, seed.sql, and query.sql",
        );
    });

    it("uses SQL workspace language for default code_input help", () => {
        const repaired = repairTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Query",
                        prompt: "Write a query to list student names.",
                        hint: "",
                        help: {
                            concept: "",
                            hint_1: "",
                            hint_2: "",
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

        const exercise = repaired.quizDraft[0] as any;
        const combined = [
            exercise.hint,
            exercise.help.concept,
            exercise.help.hint_1,
            exercise.help.hint_2,
        ].join(" ");

        expect(combined).toContain("SQL editor");
        expect(combined).toContain("Run query");
        expect(combined).toContain("results table");
        expect(combined).not.toMatch(/Python|program output|script|terminal|\.py/i);
    });
});
