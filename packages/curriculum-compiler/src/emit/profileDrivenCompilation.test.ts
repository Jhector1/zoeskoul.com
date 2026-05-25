import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { ManifestCodeInput } from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    profileSupportsCodeInput,
    pythonShape,
    registerCurriculumProfile,
    registerCurriculumProfileAdapter,
    sqlShape,
    unregisterCurriculumProfile,
    unregisterCurriculumProfileAdapter,
    type CourseProfile,
    type CourseProfileAdapter,
} from "@zoeskoul/curriculum-profiles";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { workspaceToRuntimeDefaults } from "../policy/workspaceToRuntimeDefaults.js";
import { buildTopicBundleFromDraft } from "./buildTopicBundleFromDraft.js";
import { stableJsonStringify } from "../reports/stableHash.js";

function makeWorkspacePolicy() {
    return {
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
    } as any;
}

function makePythonSeed() {
    return {
        profileId: "python",
        subjectSlug: "python-for-beginners",
        moduleSlug: "python-1",
        modulePrefix: "py1",
        moduleOrder: 1,
        sectionSlug: "python-1-section-1",
        sectionOrder: 1,
        topicId: "read-and-add",
        order: 1,
        title: "Read and Add",
        summary: "Read input and add one.",
        minutes: 15,
        sourceLocale: "en",
        targetLocales: [],
        moduleRuntimeDefaults: {
            kind: "code",
            language: "python",
        },
    } as any;
}

function makeSqlSeed() {
    return {
        subjectSlug: "sql",
        profileId: "sql",
        moduleSlug: "sql_module_0",
        modulePrefix: "sql0",
        moduleOrder: 1,
        sectionSlug: "section_1_1",
        sectionOrder: 1,
        topicId: "what-sql-means",
        order: 1,
        title: "What SQL Means",
        summary: "Intro topic",
        minutes: 15,
        sourceLocale: "en",
        targetLocales: [],
        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
            showSchema: true,
        },
    } as any;
}

function makeDraft(exercise: any) {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [exercise],
    } as any;
}

afterEach(() => {
    unregisterCurriculumProfile("testlang");
    unregisterCurriculumProfileAdapter("testlang");
});

describe("profile-driven curriculum compilation", () => {
    it("fails loudly for an unknown profile instead of falling back to Python", () => {
        expect(() =>
            workspaceToRuntimeDefaults({
                policy: makeWorkspacePolicy(),
                profileId: "javascript",
            }),
        ).toThrow(
            "Unknown curriculum profile: javascript. Register a profile adapter before compiling.",
        );
    });

    it("keeps Python code_input defaults inside the Python profile", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: makePythonSeed(),
            draft: makeDraft({
                id: "py-ex-1",
                kind: "code_input",
                title: "Read and add",
                prompt: "Prompt",
                starterCode: "n = int(input())\n",
                solutionCode: "n = int(input())\nprint(n + 1)",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n", stdout: "2\n", match: "exact" },
                    { stdin: "4\n", stdout: "5\n", match: "exact" },
                ],
            }),
        });

        const exercise = bundle.exercises[0] as ManifestCodeInput;
        const serialized = JSON.stringify(bundle);

        expect(exercise.language).toBe("python");
        expect(exercise.runtime).toBeUndefined();
        expect(exercise.workspace?.entryFilePath).toBe("main.py");
        expect(exercise.workspace?.starterFiles).toEqual([
            expect.objectContaining({
                path: "main.py",
                language: "python",
                isEntry: true,
            }),
        ]);
        expect(exercise.recipe.type).toBe("fixed_tests");
        expect(serialized).not.toContain("main.sql");
    });

    it("carries Python file fixtures into the emitted workspace manifest", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: makePythonSeed(),
            draft: makeDraft({
                id: "py-file-1",
                kind: "code_input",
                title: "Read names",
                prompt: "Read names.txt and print the first name.",
                starterCode: "with open('names.txt') as f:\n    # Your code here\n",
                solutionCode: "with open('names.txt') as f:\n    print(f.readline().strip())\n",
                recipeType: "fixed_tests",
                tests: [
                    { stdout: "Ada\n", match: "exact" },
                    { stdout: "Ada\n", match: "exact" },
                ],
                files: [
                    {
                        path: "names.txt",
                        content: "Ada\nGrace\nLinus\n",
                        readOnly: true,
                    },
                ],
            }),
        });

        const exercise = bundle.exercises[0] as ManifestCodeInput;
        expect(exercise.workspace?.files).toEqual([
            expect.objectContaining({
                path: "names.txt",
                content: "Ada\nGrace\nLinus\n",
            }),
        ]);
        expect(exercise.starterFiles).toEqual([
            expect.objectContaining({ path: "main.py" }),
        ]);
        expect(exercise.workspace?.starterFiles).toEqual([
            expect.objectContaining({ path: "main.py" }),
        ]);
    });

    it("compiles the same draft and seed into the same topic bundle every time", () => {
        const args = {
            shape: pythonShape,
            seed: makePythonSeed(),
            draft: makeDraft({
                id: "py-ex-1",
                kind: "code_input",
                title: "Read and add",
                prompt: "Prompt",
                starterCode: "n = int(input())\n",
                solutionCode: "n = int(input())\nprint(n + 1)",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n", stdout: "2\n", match: "exact" },
                    { stdin: "4\n", stdout: "5\n", match: "exact" },
                ],
            }),
        } as const;

        const first = buildTopicBundleFromDraft(args);
        const second = buildTopicBundleFromDraft(args);

        expect(stableJsonStringify(first)).toBe(stableJsonStringify(second));
    });

    it("keeps SQL code_input defaults inside the SQL profile without Python leakage", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: sqlShape,
            seed: makeSqlSeed(),
            draft: makeDraft({
                id: "sql-ex-1",
                kind: "code_input",
                title: "Write a query",
                prompt: "Prompt",
                starterCode: "SELECT * FROM students;",
                solutionCode: "SELECT * FROM students;",
                datasetId: "students_intro",
            }),
        });

        const exercise = bundle.exercises[0] as ManifestCodeInput;
        const serialized = JSON.stringify(bundle);

        expect(exercise.language).toBe("sql");
        expect(exercise.runtime).toMatchObject({
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        });
        expect(exercise.workspace?.entryFilePath).toBe("main.sql");
        expect(exercise.workspace?.starterFiles).toEqual([
            expect.objectContaining({
                path: "main.sql",
                language: "sql",
                isEntry: true,
            }),
        ]);
        expect(serialized).not.toContain("main.py");
        expect(serialized).not.toContain('"language":"python"');
    });

    it("uses a registered test-only profile without changing compiler core", () => {
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
                defaultStarter() {
                    return "// Write your testlang answer below\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest(args: any) {
                    const starterCode = String(args.exercise.starterCode ?? "").trim();

                    return {
                        id: args.exercise.id,
                        kind: "code_input",
                        purpose: "project",
                        weight: 1,
                        messageBase: args.messageBase,
                        language: "testlang",
                        starterCode,
                        workspace: {
                            language: "testlang",
                            entryFilePath: "main.test",
                            starterCode,
                            starterFiles: [
                                {
                                    path: "main.test",
                                    content: starterCode,
                                    language: "testlang",
                                    isEntry: true,
                                },
                            ],
                        },
                        recipe: {
                            type: "fixed_tests",
                            tests: [{ stdin: "1\n", stdout: "ok\n", match: "exact" }],
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
                    exercisePolicy: args.module.exercisePolicy,
                    modulePrefix: args.module.prefix,
                    moduleOrder: args.module.order,
                    sectionOrder: args.section.order,
                    moduleRuntimeDefaults: args.module.runtimeDefaults ?? undefined,
                } as any;
            },
            validateTopicRecipe() {
                return [];
            },
            compileTopicRecipe(args) {
                return args.recipe;
            },
            buildSubjectManifest() {
                throw new Error("Not needed in this test");
            },
        };

        registerCurriculumProfile(testlangProfile);
        registerCurriculumProfileAdapter(testlangAdapter);

        const runtimeDefaults = workspaceToRuntimeDefaults({
            policy: makeWorkspacePolicy(),
            profileId: "testlang",
        });

        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                subjectSlug: "testlang-subject",
                courseSlug: "testlang-course",
                profileId: "testlang",
                sourceLocale: "en",
                targetLocales: [],
                title: "Testlang",
                level: "beginner",
                audience: [],
                goals: [],
                constraints: {
                    moduleCount: 1,
                    topicsPerModuleMin: 1,
                    topicsPerModuleMax: 1,
                },
            } as any,
            spec: {
                modules: [],
            } as any,
            module: {
                moduleSlug: "testlang-1",
                prefix: "tl1",
                title: "Module 1",
                order: 1,
                learningObjectives: [],
                guidedExercises: [],
                quizFocus: [],
            } as any,
            section: {
                sectionSlug: "section-1",
                title: "Section 1",
                order: 1,
            } as any,
            topic: {
                topicId: "hello-testlang",
                order: 1,
                title: "Hello Testlang",
                summary: "Summary",
                minutes: 10,
                learningGoals: [],
            } as any,
        });

        const bundle = buildTopicBundleFromDraft({
            shape: testlangProfile.shape,
            seed,
            draft: makeDraft({
                id: "testlang-ex-1",
                kind: "code_input",
                title: "Hello Testlang",
                prompt: "Print ok",
                starterCode: "// todo\n",
                solutionCode: "print ok",
                tests: [{ stdin: "1\n", stdout: "ok\n", match: "exact" }],
            }),
        });

        const exercise = bundle.exercises[0] as ManifestCodeInput;
        const serialized = JSON.stringify(bundle);

        expect(runtimeDefaults).toMatchObject({
            kind: "code",
            language: "testlang",
        });
        expect(seed.moduleRuntimeDefaults).toMatchObject({
            kind: "code",
            language: "testlang",
        });
        expect(exercise.language).toBe("testlang");
        expect(exercise.workspace?.entryFilePath).toBe("main.test");
        expect(serialized).not.toContain("main.py");
        expect(serialized).not.toContain("main.sql");
    });

    it("does not leak Python runtime defaults from the math profile", () => {
        const runtimeDefaults = workspaceToRuntimeDefaults({
            policy: makeWorkspacePolicy(),
            profileId: "math",
        });
        const mathProfile = getCurriculumProfile("math");

        expect(profileSupportsCodeInput(mathProfile)).toBe(false);
        expect(mathProfile.codeInput).toBeUndefined();
        expect(mathProfile.runtimeKind).toBeUndefined();
        expect(mathProfile.defaultLanguage).toBeUndefined();
        expect(mathProfile.defaultEntryFileName).toBeUndefined();
        expect(runtimeDefaults).toMatchObject({
            kind: "code",
        });
        expect(JSON.stringify(runtimeDefaults)).not.toContain("python");
        expect(JSON.stringify(runtimeDefaults)).not.toContain("main.py");
    });

    it("keeps generic compiler and prompt files free of direct Python and SQL branching", async () => {
        const genericFiles = await Promise.all([
            fs.readFile(new URL("./buildTopicBundleFromDraft.ts", import.meta.url), "utf8"),
            fs.readFile(
                new URL("../policy/workspaceToRuntimeDefaults.ts", import.meta.url),
                "utf8",
            ),
            fs.readFile(
                new URL("../normalize/sanitizeHintLeaksInDraft.ts", import.meta.url),
                "utf8",
            ),
            fs.readFile(
                new URL("../normalize/repairTopicAuthoringDraft.ts", import.meta.url),
                "utf8",
            ),
            fs.readFile(
                new URL("../../../curriculum-ai/src/prompts/exerciseKindPromptRules.ts", import.meta.url),
                "utf8",
            ),
            fs.readFile(
                new URL("../../../curriculum-ai/src/prompts/buildTopicAuthoringDraftPrompt.ts", import.meta.url),
                "utf8",
            ),
        ]);
        const source = genericFiles.join("\n");

        expect(source).not.toContain('profileId === "sql"');
        expect(source).not.toContain('profileId !== "sql"');
        expect(source).not.toContain('language: "python" as const');
        expect(source).not.toContain('language: "sql" as const');
        expect(source).not.toContain('If profileId is sql');
        expect(source).not.toContain('If profileId is not sql');
    });

    it("keeps generic normalizer files free of starter-code language branches and literals", async () => {
        const source = await fs.readFile(
            new URL("../normalize/normalizeTopicAuthoringDraft.ts", import.meta.url),
            "utf8",
        );

        expect(source).not.toContain('language === "sql"');
        expect(source).not.toContain('language === "python"');
        expect(source).not.toContain('language === "bash"');
        expect(source).not.toContain('language === "javascript"');
        expect(source).not.toContain('language === "java"');
        expect(source).not.toContain('language === "c"');
        expect(source).not.toContain('language === "cpp"');
        expect(source).not.toContain("-- Write your SQL answer below");
        expect(source).not.toContain("# Write your answer below");
        expect(source).not.toContain("// Write your answer below");
        expect(source).not.toContain("legacyDefaultStarterCodeForCodeInput");
    });

    it("uses capability helpers instead of flat code_input hooks in generic files, and math stays code-free", async () => {
        const [bundleSource, normalizeSource, repairSource, sanitizeSource, mathSource] =
            await Promise.all([
                fs.readFile(new URL("./buildTopicBundleFromDraft.ts", import.meta.url), "utf8"),
                fs.readFile(
                    new URL("../normalize/normalizeTopicAuthoringDraft.ts", import.meta.url),
                    "utf8",
                ),
                fs.readFile(
                    new URL("../normalize/repairIncompleteExercises.ts", import.meta.url),
                    "utf8",
                ),
                fs.readFile(
                    new URL("../normalize/sanitizeHintLeaksInDraft.ts", import.meta.url),
                    "utf8",
                ),
                fs.readFile(
                    new URL("../../../curriculum-profiles/src/math/index.ts", import.meta.url),
                    "utf8",
                ),
            ]);
        const genericSource = [bundleSource, normalizeSource, repairSource, sanitizeSource].join(
            "\n",
        );

        expect(genericSource).not.toContain("profile.defaultCodeInputStarter");
        expect(genericSource).not.toContain("profile.defaultCodeInputRecipeType");
        expect(genericSource).not.toContain("profile.buildCodeInputManifest");
        expect(genericSource).toContain("assertProfileSupportsCodeInput");

        expect(mathSource).not.toContain('# Write your answer below');
        expect(mathSource).not.toContain("main.py");
        expect(mathSource).not.toContain('runtimeKind: "code"');
        expect(mathSource).not.toContain("buildCodeInputManifest");
    });
});
