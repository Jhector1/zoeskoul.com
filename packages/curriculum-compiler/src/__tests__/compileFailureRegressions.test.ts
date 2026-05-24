import { afterEach, describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import {
    mathShape,
    pythonShape,
    registerCurriculumProfile,
    registerCurriculumProfileAdapter,
    sqlShape,
    unregisterCurriculumProfile,
    unregisterCurriculumProfileAdapter,
    type CourseProfile,
    type CourseProfileAdapter,
} from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildCurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import { workspaceToRuntimeDefaults } from "../policy/workspaceToRuntimeDefaults.js";

const help = {
    concept: "Use the exact runtime for this course profile.",
    hint_1: "Check the file and language metadata.",
    hint_2: "The profile owns workspace defaults.",
};

function baseSeed(
    profileId: string,
    overrides: Partial<TopicSeed> = {},
): TopicSeed {
    return {
        profileId,
        subjectSlug: `${profileId}-subject`,
        courseSlug: `${profileId}-course`,
        moduleSlug: "module-1",
        sectionSlug: "section-1",
        topicId: "workspace-guard",
        order: 1,
        title: "Workspace Guard",
        summary: "Guard against workspace leaks.",
        minutes: 15,
        moduleTitle: "Module",
        moduleObjectives: ["Protect workspace metadata."],
        guidedExercises: [],
        quizFocus: [],
        sectionTitle: "Section",
        sourceLocale: "en",
        targetLocales: [],
        modulePrefix: "m1",
        moduleOrder: 1,
        sectionOrder: 1,
        moduleRuntimeDefaults:
            profileId === "sql"
                ? {
                    kind: "sql",
                    datasetId: "music_store",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                    showSchema: true,
                }
                : profileId === "math"
                    ? null
                    : { kind: "code", language: profileId as any },
        learningGoals: ["Use the correct runtime metadata."],
        ...overrides,
    } as TopicSeed;
}

function pythonDraft(): TopicAuthoringDraft {
    return {
        title: "Print value",
        summary: "Print a value.",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [{
            id: "code-1",
            kind: "code_input",
            title: "Print two",
            prompt: "Print 2.",
            hint: "Use print.",
            help,
            starterCode: "# Write your answer below\n",
            solutionCode: "print(2)",
            recipeType: "fixed_tests",
            tests: [
                { stdout: "2", match: "exact" },
                { stdout: "2", match: "exact" },
            ],
        }],
    };
}

function sqlDraft(): TopicAuthoringDraft {
    return {
        title: "Select value",
        summary: "Select a value.",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [{
            id: "sql-1",
            kind: "code_input",
            title: "Select one",
            prompt: "Select 1.",
            hint: "Use SELECT.",
            help,
            starterCode: "-- Write your SQL answer below\n",
            solutionCode: "SELECT 1;",
            recipeType: "sql_query",
            datasetId: "music_store",
        }],
    };
}

afterEach(() => {
    unregisterCurriculumProfile("testlang");
    unregisterCurriculumProfileAdapter("testlang");
});

describe("compile failure regressions", () => {
    it("blocks a SQL topic bundle that has Python workspace metadata", () => {
        const seed = baseSeed("sql");
        const draft = sqlDraft();
        const topicBundle = buildTopicBundleFromDraft({ shape: sqlShape, seed, draft });
        const badBundle = {
            ...topicBundle,
            exercises: topicBundle.exercises.map((exercise) =>
                exercise.kind === "code_input"
                    ? {
                        ...exercise,
                        language: "python",
                        workspace: {
                            ...exercise.workspace,
                            language: "python",
                            entryFilePath: "main.py",
                        },
                    }
                    : exercise,
            ),
        };

        const report = buildCurriculumQualityReport({
            profileId: "sql",
            subjectSlug: "sql-subject",
            topics: [{ seed, draft, topicBundle: badBundle as any }],
        });

        expect(report.ok).toBe(false);
        expect(report.issues.map((issue) => issue.code)).toContain("WORKSPACE_LANGUAGE_LEAK");
        expect(report.issues.map((issue) => issue.code)).toContain("WORKSPACE_ENTRY_FILE_LEAK");
    });

    it("blocks a Python topic bundle that has SQL workspace metadata", () => {
        const seed = baseSeed("python");
        const draft = pythonDraft();
        const topicBundle = buildTopicBundleFromDraft({ shape: pythonShape, seed, draft });
        const badBundle = {
            ...topicBundle,
            exercises: topicBundle.exercises.map((exercise) =>
                exercise.kind === "code_input"
                    ? {
                        ...exercise,
                        language: "sql",
                        workspace: {
                            ...exercise.workspace,
                            language: "sql",
                            entryFilePath: "main.sql",
                        },
                    }
                    : exercise,
            ),
        };

        const report = buildCurriculumQualityReport({
            profileId: "python",
            subjectSlug: "python-subject",
            topics: [{ seed, draft, topicBundle: badBundle as any }],
        });

        expect(report.ok).toBe(false);
        expect(report.issues.map((issue) => issue.code)).toContain("WORKSPACE_LANGUAGE_LEAK");
        expect(report.issues.map((issue) => issue.code)).toContain("WORKSPACE_ENTRY_FILE_LEAK");
    });

    it("rejects math code_input loudly before manifest emission", () => {
        const seed = baseSeed("math");
        const draft = pythonDraft();

        const report = buildCurriculumQualityReport({
            profileId: "math",
            subjectSlug: "math-subject",
            topics: [{ seed, draft }],
        });

        expect(report.ok).toBe(false);
        expect(report.issues.map((issue) => issue.code)).toContain("UNSUPPORTED_EXERCISE_KIND");
        expect(report.issues.map((issue) => issue.code)).toContain("PROFILE_DOES_NOT_SUPPORT_CODE_INPUT");
        expect(() =>
            buildTopicBundleFromDraft({ shape: mathShape, seed, draft }),
        ).toThrow('Profile "math" does not support code_input exercises.');
    });

    it("fails loudly for an unknown profile instead of falling back", () => {
        expect(() =>
            workspaceToRuntimeDefaults({
                policy: {
                    workspace: {
                        capabilities: {
                            singleFileCodeInput: { enabled: true },
                            multiFileProjects: { enabled: false },
                            terminal: { enabled: false },
                            filesystem: { enabled: false },
                            stdinStdout: { enabled: true },
                            packageInstall: { enabled: false },
                            externalNetwork: { enabled: false },
                            uploads: { enabled: false },
                            sql: {
                                queryRunner: { enabled: false },
                                resultsTable: { enabled: false },
                                schemaBrowser: { enabled: false },
                                erdDiagram: { enabled: false },
                                chenDiagram: { enabled: false },
                            },
                        },
                    },
                } as any,
                profileId: "javascript",
            }),
        ).toThrow(
            "Unknown curriculum profile: javascript. Register a profile adapter before compiling.",
        );
    });

    it("supports a fake test-only code profile without touching compiler core", () => {
        const testlangProfile: CourseProfile = {
            id: "testlang",
            shape: {
                ...pythonShape,
                profileId: "testlang",
            },
            runtimeKind: "code",
            defaultLanguage: "testlang",
            defaultEntryFileName: "main.test",
            allowedExerciseKinds: ["code_input"],
            allowedRecipeTypes: ["fixed_tests"],
            buildModuleRuntimeDefaults() {
                return { kind: "code", language: "testlang" };
            },
            codeInput: {
                minimumFixedTests: 1,
                defaultStarter() {
                    return "// testlang\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest(args: any) {
                    return {
                        id: args.exercise.id,
                        kind: "code_input",
                        purpose: "project",
                        weight: 1,
                        messageBase: args.messageBase,
                        language: "testlang",
                        starterCode: String(args.exercise.starterCode ?? ""),
                        workspace: {
                            language: "testlang",
                            entryFilePath: "main.test",
                            starterCode: String(args.exercise.starterCode ?? ""),
                            starterFiles: [
                                {
                                    path: "main.test",
                                    content: String(args.exercise.starterCode ?? ""),
                                    language: "testlang",
                                    isEntry: true,
                                },
                            ],
                        },
                        recipe: {
                            type: "fixed_tests",
                            tests: [{ stdout: "ok", match: "exact" }],
                            solutionCode: String(args.exercise.solutionCode ?? ""),
                        },
                    };
                },
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };

        const testlangAdapter: CourseProfileAdapter = {
            id: "testlang",
            buildTopicSeed(args) {
                return {
                    subjectSlug: args.blueprint.subjectSlug,
                    profileId: args.blueprint.profileId,
                    moduleSlug: args.module.slug,
                    sectionSlug: args.section.slug,
                    topicId: args.topic.topicId,
                    order: args.topic.order,
                    title: args.topic.title,
                    summary: args.topic.summary,
                    minutes: args.topic.minutes,
                    moduleTitle: args.module.title,
                    moduleObjectives: args.module.learningObjectives ?? [],
                    guidedExercises: args.module.guidedExercises ?? [],
                    quizFocus: args.module.quizFocus ?? [],
                    sectionTitle: args.section.title,
                    sourceLocale: args.blueprint.sourceLocale,
                    targetLocales: args.blueprint.targetLocales ?? [],
                    modulePrefix: args.module.prefix,
                    moduleOrder: args.module.order,
                    sectionOrder: args.section.order,
                    moduleRuntimeDefaults: { kind: "code", language: "testlang" },
                    learningGoals: ["Use testlang."],
                } as any;
            },
            validateTopicRecipe() {
                return [];
            },
            compileTopicRecipe(args) {
                return args.recipe;
            },
            buildSubjectManifest() {
                throw new Error("not needed");
            },
        };

        registerCurriculumProfile(testlangProfile);
        registerCurriculumProfileAdapter(testlangAdapter);

        const seed = baseSeed("testlang", {
            subjectSlug: "testlang-subject",
            moduleRuntimeDefaults: { kind: "code", language: "testlang" } as any,
        });
        const bundle = buildTopicBundleFromDraft({
            shape: testlangProfile.shape,
            seed,
            draft: pythonDraft(),
        });

        expect(bundle.exercises[0]).toMatchObject({
            kind: "code_input",
            language: "testlang",
            workspace: {
                entryFilePath: "main.test",
            },
        });
    });
});
