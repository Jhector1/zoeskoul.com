import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import { pythonShape, sqlShape, mathShape } from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildCurriculumQualityReport } from "./buildCurriculumQualityReport.js";

function seed(overrides: Partial<TopicSeed> = {}): TopicSeed {
    return {
        profileId: "python",
        subjectSlug: "python-for-beginners",
        courseSlug: "python-course",
        moduleSlug: "module-1",
        sectionSlug: "section-1",
        topicId: "topic-1",
        order: 1,
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        moduleTitle: "Module",
        moduleObjectives: [],
        guidedExercises: [],
        quizFocus: [],
        sectionTitle: "Section",
        sourceLocale: "en",
        targetLocales: [],
        modulePrefix: "m1",
        moduleOrder: 1,
        sectionOrder: 1,
        moduleRuntimeDefaults: { kind: "code", language: "python" },
        ...overrides,
    } as TopicSeed;
}

const help = {
    concept: "Use the taught pattern.",
    hint_1: "Look at the input.",
    hint_2: "Print the final answer.",
};

function pythonDraft(overrides: Partial<Extract<TopicAuthoringDraft["quizDraft"][number], { kind: "code_input" }>> = {}): TopicAuthoringDraft {
    return {
        title: "Read and add",
        summary: "Read input and add one.",
        minutes: 15,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Use input and print." }],
        quizDraft: [
            {
                id: "code-1",
                kind: "code_input",
                title: "Add one",
                prompt: "Read a number and print the next number.",
                hint: "Use input, convert, and print.",
                help,
                starterCode: "# Write your answer below\n",
                solutionCode: "n = int(input())\nprint(n + 1)",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n", stdout: "2\n", match: "exact" },
                    { stdin: "4\n", stdout: "5\n", match: "exact" },
                ],
                ...overrides,
            },
        ],
    };
}

function mathDraft(): TopicAuthoringDraft {
    return {
        title: "Compare numbers",
        summary: "Choose the larger value.",
        minutes: 10,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Compare values." }],
        quizDraft: [
            {
                id: "choice-1",
                kind: "single_choice",
                title: "Larger value",
                prompt: "Which value is larger?",
                hint: "Compare both values.",
                help,
                options: ["3", "5"],
                correctOptionIds: ["b"],
            },
        ],
    };
}

function sqlSeed(overrides: Partial<TopicSeed> = {}) {
    return seed({
        profileId: "sql",
        subjectSlug: "sql-foundations",
        courseSlug: "sql-course",
        topicId: "select-artists",
        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "music_store",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
            showSchema: true,
        },
        ...overrides,
    });
}

function sqlDraft(overrides: Partial<Extract<TopicAuthoringDraft["quizDraft"][number], { kind: "code_input" }>> = {}): TopicAuthoringDraft {
    return {
        title: "Select artists",
        summary: "Select rows from a table.",
        minutes: 15,
        sketchBlocks: [{ id: "s1", title: "Sketch", bodyMarkdown: "Use SELECT." }],
        quizDraft: [
            {
                id: "sql-1",
                kind: "code_input",
                title: "Select names",
                prompt: "Select every artist name.",
                hint: "Use SELECT and FROM.",
                help,
                starterCode: "-- Write your SQL answer below\n",
                solutionCode: "SELECT name FROM artists;",
                recipeType: "sql_query",
                datasetId: "music_store",
                ...overrides,
            },
        ],
    };
}

describe("buildCurriculumQualityReport", () => {
    it("passes good Python, SQL, and Math fixtures", () => {
        const pySeed = seed();
        const pyDraft = pythonDraft();
        const pyBundle = buildTopicBundleFromDraft({ shape: pythonShape, seed: pySeed, draft: pyDraft });

        const sqlTopicSeed = sqlSeed();
        const sqlTopicDraft = sqlDraft();
        const sqlBundle = buildTopicBundleFromDraft({ shape: sqlShape, seed: sqlTopicSeed, draft: sqlTopicDraft });

        const mSeed = seed({ profileId: "math", subjectSlug: "math", moduleRuntimeDefaults: null });
        const mDraft = mathDraft();
        const mBundle = buildTopicBundleFromDraft({ shape: mathShape, seed: mSeed, draft: mDraft });

        expect(buildCurriculumQualityReport({ profileId: "python", subjectSlug: "python-for-beginners", topics: [{ seed: pySeed, draft: pyDraft, topicBundle: pyBundle }] }).ok).toBe(true);
        expect(buildCurriculumQualityReport({ profileId: "sql", subjectSlug: "sql-foundations", topics: [{ seed: sqlTopicSeed, draft: sqlTopicDraft, topicBundle: sqlBundle }] }).ok).toBe(true);
        expect(buildCurriculumQualityReport({ profileId: "math", subjectSlug: "math", topics: [{ seed: mSeed, draft: mDraft, topicBundle: mBundle }] }).ok).toBe(true);
    });

    it("flags weak fixed_tests coverage", () => {
        const pySeed = seed();
        const draft = pythonDraft({ tests: [{ stdin: "1\n", stdout: "2\n" }] });
        const report = buildCurriculumQualityReport({ profileId: "python", subjectSlug: "python-for-beginners", topics: [{ seed: pySeed, draft }] });
        expect(report.issues.some((issue) => issue.code === "THIN_FIXED_TEST_COVERAGE" && issue.severity === "error")).toBe(true);
    });

    it("accepts Python fixed_tests once two distinct tests are present", () => {
        const pySeed = seed();
        const draft = pythonDraft({
            tests: [
                { stdin: "1\n", stdout: "2\n", match: "exact" },
                { stdin: "4\n", stdout: "5\n", match: "exact" },
            ],
        });
        const report = buildCurriculumQualityReport({
            profileId: "python",
            subjectSlug: "python-for-beginners",
            topics: [{ seed: pySeed, draft }],
        });

        expect(
            report.issues.some((issue) => issue.code === "THIN_FIXED_TEST_COVERAGE"),
        ).toBe(false);
        expect(report.ok).toBe(true);
    });

    it("blocks starter code that reveals the solution", () => {
        const pySeed = seed();
        const draft = pythonDraft({ starterCode: "print(2)", solutionCode: "print(2)" });
        const report = buildCurriculumQualityReport({ profileId: "python", subjectSlug: "python-for-beginners", topics: [{ seed: pySeed, draft }] });
        expect(report.ok).toBe(false);
        expect(report.issues.some((issue) => issue.code === "STARTER_REVEALS_SOLUTION" && issue.severity === "blocker")).toBe(true);
    });

    it("blocks SQL bundles with Python workspace metadata", () => {
        const sqlTopicSeed = sqlSeed();
        const draft = sqlDraft();
        const bundle = buildTopicBundleFromDraft({ shape: sqlShape, seed: sqlTopicSeed, draft });
        const badBundle = {
            ...bundle,
            exercises: bundle.exercises.map((exercise) => exercise.kind === "code_input" ? {
                ...exercise,
                language: "python",
                workspace: { ...exercise.workspace, language: "python", entryFilePath: "main.py" },
            } : exercise),
        };
        const report = buildCurriculumQualityReport({ profileId: "sql", subjectSlug: "sql-foundations", topics: [{ seed: sqlTopicSeed, draft, topicBundle: badBundle as any }] });
        expect(report.ok).toBe(false);
        expect(report.issues.some((issue) => issue.code === "WORKSPACE_LANGUAGE_LEAK")).toBe(true);
        expect(report.issues.some((issue) => issue.code === "WORKSPACE_ENTRY_FILE_LEAK")).toBe(true);
    });

    it("does not apply Python thin fixed-tests checks to sql_query exercises", () => {
        const sqlTopicSeed = sqlSeed();
        const draft = sqlDraft();
        const report = buildCurriculumQualityReport({
            profileId: "sql",
            subjectSlug: "sql-foundations",
            topics: [{ seed: sqlTopicSeed, draft }],
        });

        expect(
            report.issues.some((issue) => issue.code === "THIN_FIXED_TEST_COVERAGE"),
        ).toBe(false);
    });

    it("blocks math code_input exercises", () => {
        const mSeed = seed({ profileId: "math", subjectSlug: "math", moduleRuntimeDefaults: null });
        const draft = pythonDraft();
        const report = buildCurriculumQualityReport({ profileId: "math", subjectSlug: "math", topics: [{ seed: mSeed, draft }] });
        expect(report.ok).toBe(false);
        expect(report.issues.some((issue) => issue.code === "PROFILE_DOES_NOT_SUPPORT_CODE_INPUT")).toBe(true);
    });

    it("flags missing final capstone when required", () => {
        const pySeed = seed({ topicId: "intro" });
        const report = buildCurriculumQualityReport({ profileId: "python", subjectSlug: "python-for-beginners", topics: [{ seed: pySeed, draft: pythonDraft() }], requireFinalCapstone: true });
        expect(report.ok).toBe(false);
        expect(report.issues.some((issue) => issue.code === "MISSING_FINAL_CAPSTONE" && issue.severity === "error")).toBe(true);
    });

    it("counts emitted bundle exercises when they are more complete than the saved draft", () => {
        const pySeed = seed();
        const draft = pythonDraft();
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: pySeed,
            draft,
        });
        const extraBundleExercise = {
            ...bundle.exercises[0],
            id: "code-2",
        };
        const report = buildCurriculumQualityReport({
            profileId: "python",
            subjectSlug: "python-for-beginners",
            topics: [
                {
                    seed: pySeed,
                    draft,
                    topicBundle: {
                        ...bundle,
                        exercises: [...bundle.exercises, extraBundleExercise],
                    },
                },
            ],
        });

        expect(report.summary.exercises).toBe(2);
        expect(report.summary.codeInputs).toBe(2);
        expect(report.summary.exerciseKinds.code_input).toBe(2);
    });

    it("warns on repeated exercise wording", () => {
        const pySeed = seed();
        const draft = pythonDraft();
        draft.quizDraft.push({
            ...(draft.quizDraft[0] as any),
            id: "code-2",
            solutionCode: "n = int(input())\nprint(n + 2)",
        });
        const report = buildCurriculumQualityReport({ profileId: "python", subjectSlug: "python-for-beginners", topics: [{ seed: pySeed, draft }] });
        expect(report.issues.some((issue) => issue.code === "REPEATED_EXERCISE_WORDING" && issue.severity === "warning")).toBe(true);
    });

    it("blocks SQL mutations without checkSql", () => {
        const sqlTopicSeed = sqlSeed({ topicId: "update-rows" });
        const draft = sqlDraft({
            solutionCode: "UPDATE artists SET name = 'Zoe' WHERE ArtistId = 1;",
            checkSql: undefined,
        } as any);
        const bundle = {
            ...buildTopicBundleFromDraft({ shape: sqlShape, seed: sqlTopicSeed, draft: sqlDraft() }),
            exercises: [
                {
                    id: "sql-1",
                    kind: "code_input",
                    purpose: "project",
                    weight: 1,
                    messageBase: "sql.subject.module.topic.exercise",
                    language: "sql",
                    starterCode: "-- Write your SQL answer below\n",
                    fixedSqlDialect: "sqlite",
                    runtime: {
                        kind: "sql",
                        datasetId: "music_store",
                        fixedSqlDialect: "sqlite",
                        resultShape: "table",
                        showSchema: true,
                        supportsTerminal: false,
                        supportsMultiFile: false,
                        supportsFileSystem: false,
                    },
                    workspace: {
                        language: "sql",
                        entryFilePath: "main.sql",
                        starterCode: "-- Write your SQL answer below\n",
                        starterFiles: [
                            {
                                path: "main.sql",
                                content: "-- Write your SQL answer below\n",
                                language: "sql",
                                isEntry: true,
                            },
                        ],
                    },
                    recipe: {
                        type: "sql_query",
                        datasetId: "music_store",
                        solutionCode: "UPDATE artists SET name = 'Zoe' WHERE ArtistId = 1;",
                        resultShape: "table",
                    },
                },
            ],
        } as any;

        const report = buildCurriculumQualityReport({
            profileId: "sql",
            subjectSlug: "sql-foundations",
            topics: [{ seed: sqlTopicSeed, draft, topicBundle: bundle }],
        });

        expect(report.ok).toBe(false);
        expect(report.issues.some((issue) => issue.code === "SQL_MUTATION_CHECK_SQL_MISSING")).toBe(true);
    });

    it("keeps the generic quality report free of direct Python and SQL profile branching", async () => {
        const source = await fs.readFile(
            new URL("./buildCurriculumQualityReport.ts", import.meta.url),
            "utf8",
        );

        expect(source).not.toContain('profile.id === "python"');
        expect(source).not.toContain('profile.id === "sql"');
        expect(source).not.toContain('profileId === "sql"');
        expect(source).not.toContain('non-SQL = Python');
    });
});
