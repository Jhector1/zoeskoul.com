import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import { mathShape, pythonShape, sqlShape } from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../src/emit/buildTopicBundleFromDraft.js";
import { normalizeTopicAuthoringDraft } from "../src/normalize/normalizeTopicAuthoringDraft.js";
import { sha256Json, stableJsonStringify } from "../src/reports/stableHash.js";

const help = {
    concept: "Apply the pattern from the lesson.",
    hint_1: "Focus on the required result.",
    hint_2: "Check the final output.",
};

function baseSeed(
    profileId: "python" | "sql" | "math",
    overrides: Partial<TopicSeed> = {},
): TopicSeed {
    return {
        profileId,
        subjectSlug: `${profileId}-subject`,
        courseSlug: `${profileId}-course`,
        moduleSlug: "module-1",
        sectionSlug: "section-1",
        topicId: "topic-1",
        order: 1,
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        moduleTitle: "Module",
        moduleObjectives: ["Apply the topic skill."],
        guidedExercises: [],
        quizFocus: [],
        sectionTitle: "Section",
        sourceLocale: "en",
        targetLocales: [],
        modulePrefix: "m1",
        moduleOrder: 1,
        sectionOrder: 1,
        learningGoals: ["Apply the topic skill."],
        moduleRuntimeDefaults:
            profileId === "sql"
                ? {
                    kind: "sql",
                    datasetId: "music_store",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                    showSchema: true,
                }
                : profileId === "python"
                    ? { kind: "code", language: "python" }
                    : null,
        ...overrides,
    } as TopicSeed;
}

function pythonFixedTestsDraft(): TopicAuthoringDraft {
    return {
        title: "Read input",
        summary: "Read a number and print the next number.",
        minutes: 15,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Use input and print." }],
        quizDraft: [{
            id: "code-1",
            kind: "code_input",
            title: "Add one",
            prompt: "Read a number and print the next number.",
            hint: "Use input, int, and print.",
            help,
            starterCode: "# Write your answer below\n",
            solutionCode: "n = int(input())\nprint(n + 1)",
            recipeType: "fixed_tests",
            tests: [
                { stdin: "1\n", stdout: "2\n", match: "exact" },
                { stdin: "8\n", stdout: "9\n", match: "exact" },
            ],
        }],
    };
}

function sqlSelectDraft(): TopicAuthoringDraft {
    return {
        title: "Select rows",
        summary: "Select artist names.",
        minutes: 15,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Use SELECT with FROM." }],
        quizDraft: [{
            id: "sql-1",
            kind: "code_input",
            title: "Select names",
            prompt: "Select every artist name.",
            hint: "Use SELECT name FROM artists.",
            help,
            starterCode: "-- Write your SQL answer below\n",
            solutionCode: "SELECT name FROM artists;",
            recipeType: "sql_query",
            datasetId: "music_store",
        }],
    };
}

function sqlMutationDraft(): TopicAuthoringDraft {
    return {
        title: "Insert row",
        summary: "Insert a new artist.",
        minutes: 15,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Use INSERT then verify state." }],
        quizDraft: [{
            id: "sql-mut-1",
            kind: "code_input",
            title: "Insert artist",
            prompt: "Insert a new artist named Zoe.",
            hint: "Use INSERT INTO artists.",
            help,
            starterCode: "-- Write your SQL answer below\n",
            solutionCode: "INSERT INTO artists (name) VALUES ('Zoe');",
            recipeType: "sql_query",
            datasetId: "music_store",
            checkSql: "SELECT name FROM artists WHERE name = 'Zoe';",
        }],
    };
}

function mathDraft(): TopicAuthoringDraft {
    return {
        title: "Compare numbers",
        summary: "Choose the larger value.",
        minutes: 10,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Compare both values." }],
        quizDraft: [{
            id: "choice-1",
            kind: "single_choice",
            title: "Larger value",
            prompt: "Which value is larger?",
            hint: "Compare both values.",
            help,
            options: ["3", "5", "4"],
            correctOptionIds: ["b"],
        }],
    };
}

function pythonCapstoneDraft(): TopicAuthoringDraft {
    return {
        title: "Final capstone",
        summary: "Build a small two-step Python project.",
        minutes: 25,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Reuse input, arithmetic, and print." }],
        quizDraft: [
            {
                id: "code-step-1",
                kind: "code_input",
                title: "Read values",
                prompt: "Read two integers.",
                hint: "Use input twice.",
                help,
                starterCode: "# Write your answer below\n",
                solutionCode: "a = int(input())\nb = int(input())\nprint(a + b)",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n2\n", stdout: "3\n", match: "exact" },
                    { stdin: "5\n7\n", stdout: "12\n", match: "exact" },
                ],
            },
            {
                id: "code-step-2",
                kind: "code_input",
                title: "Format result",
                prompt: "Print the labelled total.",
                hint: "Use a string label and the computed total.",
                help,
                starterCode: "# Write your answer below\n",
                solutionCode: "a = int(input())\nb = int(input())\nprint(f'Total: {a + b}')",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n2\n", stdout: "Total: 3\n", match: "exact" },
                    { stdin: "5\n7\n", stdout: "Total: 12\n", match: "exact" },
                ],
            },
        ],
        projectDraft: {
            title: "Final capstone",
            stepIds: ["code-step-1", "code-step-2"],
        },
    };
}

const fixtures = [
    {
        name: "minimal Python fixed_tests topic",
        shape: pythonShape,
        seed: baseSeed("python"),
        draft: pythonFixedTestsDraft(),
        normalizedHash: "00c2f584fa9c5fff5a1e714307231e3aa849440a7923c2da2cf653488208e560",
        bundleHash: "a778fa0f3187f7bded71631e899402741279ec386529e8e2766389c5f027d6e5",
    },
    {
        name: "SQL SELECT topic",
        shape: sqlShape,
        seed: baseSeed("sql"),
        draft: sqlSelectDraft(),
        normalizedHash: "713eeb0c79c9f178191ceea5e2c29bfc13446cc46dcdc9fab1c212ddc6effeb7",
        bundleHash: "a1fc607faf44dfdccee7ec5a0f28fc8a2467920a30c0f8e868ffbcf2f11e1183",
    },
    {
        name: "SQL mutation topic with checkSql",
        shape: sqlShape,
        seed: baseSeed("sql", { topicId: "insert-artist" }),
        draft: sqlMutationDraft(),
        normalizedHash: "8024e91ea34e1c340a8fa074180605fa264e4baac2fcc38abcb3911a2d2083db",
        bundleHash: "b0bde3ca3415cac272faa847dbb351bedf40dde86bd759e187af2e098e2145d8",
    },
    {
        name: "Math concept-only topic",
        shape: mathShape,
        seed: baseSeed("math"),
        draft: mathDraft(),
        normalizedHash: "5219020bb73b9153cd06025eebf8d6fe0b9999c7e120472da5fd45036092300f",
        bundleHash: "cbe89b18ccf2a5995c0fbec7208fd0f9a6d1892c911ef66406eee13ee07d7c68",
    },
    {
        name: "Python final capstone topic",
        shape: pythonShape,
        seed: baseSeed("python", {
            topicId: "final-capstone",
            title: "Final Capstone",
            summary: "Build a small final project.",
            moduleProject: "Build a final Python capstone.",
        }),
        draft: pythonCapstoneDraft(),
        normalizedHash: "772070de2091e9ab17dc251eba38d7ce6520dba0e53590d9342268c4aa7ae503",
        bundleHash: "367c9ce120c1a5f72e706ff1460be3c7818ce4a22d482efd2b64691eb7a24dd8",
    },
];

describe("golden curriculum compiler fixtures", () => {
    for (const fixture of fixtures) {
        it(`${fixture.name} compiles deterministically`, () => {
            const normalizedFirst = normalizeTopicAuthoringDraft(fixture.draft, {
                profileId: fixture.seed.profileId,
            });
            const normalizedSecond = normalizeTopicAuthoringDraft(fixture.draft, {
                profileId: fixture.seed.profileId,
            });

            const bundleFirst = buildTopicBundleFromDraft({
                shape: fixture.shape,
                seed: fixture.seed,
                draft: normalizedFirst,
            });
            const bundleSecond = buildTopicBundleFromDraft({
                shape: fixture.shape,
                seed: fixture.seed,
                draft: normalizedSecond,
            });

            expect(stableJsonStringify(normalizedFirst)).toBe(
                stableJsonStringify(normalizedSecond),
            );
            expect(stableJsonStringify(bundleFirst)).toBe(
                stableJsonStringify(bundleSecond),
            );
            expect(sha256Json(normalizedFirst)).toBe(fixture.normalizedHash);
            expect(sha256Json(bundleFirst)).toBe(fixture.bundleHash);
        });
    }

    it("Python fixture preserves fixed_tests and avoids SQL leakage", () => {
        const normalized = normalizeTopicAuthoringDraft(pythonFixedTestsDraft(), {
            profileId: "python",
        });
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: baseSeed("python"),
            draft: normalized,
        });
        const exercise = bundle.exercises[0] as any;
        const json = stableJsonStringify(bundle);

        expect(exercise.language).toBe("python");
        expect(exercise.recipe.type).toBe("fixed_tests");
        expect(exercise.workspace.entryFilePath).toBe("main.py");
        expect(exercise.starterCode).not.toBe(exercise.recipe.solutionCode);
        expect(json).not.toContain("main.sql");
        expect(json).not.toContain('"kind": "sql"');
    });

    it("SQL SELECT fixture preserves sql_query metadata and avoids Python leakage", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: sqlShape,
            seed: baseSeed("sql"),
            draft: normalizeTopicAuthoringDraft(sqlSelectDraft(), {
                profileId: "sql",
            }),
        });
        const exercise = bundle.exercises[0] as any;
        const json = stableJsonStringify(bundle);

        expect(exercise.language).toBe("sql");
        expect(exercise.recipe.type).toBe("sql_query");
        expect(exercise.recipe.datasetId).toBe("music_store");
        expect(exercise.workspace.entryFilePath).toBe("main.sql");
        expect(json).not.toContain("main.py");
        expect(json).not.toContain('"language": "python"');
    });

    it("SQL mutation fixture preserves checkSql and avoids Python leakage", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: sqlShape,
            seed: baseSeed("sql", { topicId: "insert-artist" }),
            draft: normalizeTopicAuthoringDraft(sqlMutationDraft(), {
                profileId: "sql",
            }),
        });
        const exercise = bundle.exercises[0] as any;
        const json = stableJsonStringify(bundle);

        expect(exercise.recipe.type).toBe("sql_query");
        expect(exercise.recipe.checkSql).toContain("SELECT name FROM artists");
        expect(json).not.toContain("main.py");
        expect(json).not.toContain('"language": "python"');
    });

    it("Math fixture emits no code_input or code runtime leakage", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: mathShape,
            seed: baseSeed("math"),
            draft: normalizeTopicAuthoringDraft(mathDraft(), {
                profileId: "math",
            }),
        });
        const json = stableJsonStringify(bundle);

        expect(bundle.exercises.every((exercise) => exercise.kind !== "code_input")).toBe(true);
        expect(json).not.toContain("main.py");
        expect(json).not.toContain('"kind": "code"');
    });

    it("Capstone fixture emits project metadata without changing manifest shape", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: baseSeed("python", {
                topicId: "final-capstone",
                title: "Final Capstone",
                summary: "Build a small final project.",
                moduleProject: "Build a final Python capstone.",
            }),
            draft: normalizeTopicAuthoringDraft(pythonCapstoneDraft(), {
                profileId: "python",
            }),
        });

        const projectCard = bundle.cards.find((card) => card.kind === "project") as any;
        expect(projectCard).toBeDefined();
        expect(projectCard.project.steps.map((step: any) => step.exerciseKey)).toEqual([
            "code-step-1",
            "code-step-2",
        ]);
        expect(bundle.exercises.filter((exercise) => exercise.kind === "code_input")).toHaveLength(2);
    });
});
