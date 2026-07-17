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

    it("preserves authored solutionFiles and sourceChecks for code_input exercises", () => {
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
                    solutionFiles: [
                        {
                            path: "main.py",
                            content: "from helpers.names import clean_name\nprint(clean_name(' ava '))\n",
                            isEntry: true,
                        },
                        {
                            path: "helpers/names.py",
                            content: "def clean_name(text):\n    return text.strip().title()\n",
                        },
                    ],
                    sourceChecks: [
                        {
                            type: "source_contains",
                            pattern: "from helpers.names import clean_name",
                            message: "Import clean_name from helpers.names.",
                        },
                    ],
                    tests: [
                        { stdout: "ok\n", match: "exact" },
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
        expect(exercise.solutionFiles).toEqual([
            {
                path: "main.py",
                content: "from helpers.names import clean_name\nprint(clean_name(' ava '))\n",
                isEntry: true,
            },
            {
                path: "helpers/names.py",
                content: "def clean_name(text):\n    return text.strip().title()\n",
            },
        ]);
        expect(exercise.sourceChecks).toEqual([
            {
                type: "source_contains",
                pattern: "from helpers.names import clean_name",
                message: "Import clean_name from helpers.names.",
            },
        ]);
    });

    it("uses the only changed SQL workspace file as the active entry file", () => {
        const schemaStarter = [
            "CREATE TABLE products (",
            "    -- Add the required columns",
            ");",
        ].join("\n");
        const schemaSolution = [
            "CREATE TABLE products (",
            "    id INTEGER PRIMARY KEY,",
            "    name TEXT NOT NULL",
            ");",
        ].join("\n");

        const normalized = normalizeTopicAuthoringDraft({
            title: "Build a table",
            summary: "Define the product table.",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-schema-step",
                    kind: "code_input",
                    title: "Build the product table",
                    prompt: "Complete schema.sql.",
                    starterCode: schemaStarter,
                    solutionCode: schemaSolution,
                    recipeType: "sql_query",
                    datasetId: "ddl_blank",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "schema.sql",
                            content: schemaStarter,
                            language: "sql",
                        },
                        {
                            path: "seed.sql",
                            content: "",
                            language: "sql",
                        },
                        {
                            path: "query.sql",
                            content: "",
                            language: "sql",
                            isEntry: true,
                            entry: true,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "schema.sql",
                            content: schemaSolution,
                            language: "sql",
                        },
                        {
                            path: "seed.sql",
                            content: "",
                            language: "sql",
                        },
                        {
                            path: "query.sql",
                            content: "",
                            language: "sql",
                            isEntry: true,
                            entry: true,
                        },
                    ],
                    sqlFileOrder: [
                        "schema.sql",
                        "seed.sql",
                        "query.sql",
                    ],
                    checkSql:
                        "SELECT name FROM sqlite_master WHERE name = 'products';",
                    hint: "Define the table first.",
                    help: {
                        concept: "Schema files define tables.",
                        hint_1: "Use CREATE TABLE.",
                        hint_2: "Add a primary key.",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.entryFilePath).toBe("schema.sql");
        expect(exercise.starterCode).toBe(schemaStarter);
        expect(exercise.solutionCode).toBe(schemaSolution);
        expect(
            exercise.starterFiles.find(
                (file: any) => file.path === "schema.sql",
            ),
        ).toMatchObject({
            isEntry: true,
            entry: true,
        });
        expect(
            exercise.starterFiles.find(
                (file: any) => file.path === "query.sql",
            ),
        ).toMatchObject({
            isEntry: false,
            entry: false,
        });
    });

    it("preserves an explicit SQL file order during canonical normalization", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-1",
                    kind: "code_input",
                    title: "Create and inspect",
                    prompt: "Create a table and inspect it.",
                    starterCode: "-- Write the query\n",
                    solutionCode: "SELECT name FROM sqlite_master;\n",
                    recipeType: "sql_query",
                    datasetId: "ddl_blank",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "schema.sql",
                            content: "-- Create the table\n",
                            language: "sql",
                        },
                        {
                            path: "query.sql",
                            content: "-- Write the query\n",
                            language: "sql",
                            isEntry: true,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "schema.sql",
                            content:
                                "CREATE TABLE products (id INTEGER PRIMARY KEY);\n",
                            language: "sql",
                        },
                        {
                            path: "query.sql",
                            content: "SELECT name FROM sqlite_master;\n",
                            language: "sql",
                            isEntry: true,
                        },
                    ],
                    sqlFileOrder: ["schema.sql", "query.sql"],
                    hint: "Create first, then inspect.",
                    help: {
                        concept: "DDL file order",
                        hint_1: "Run schema.sql first.",
                        hint_2: "Run query.sql second.",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.sqlFileOrder).toEqual([
            "schema.sql",
            "query.sql",
        ]);
    });

    it("derives SQL file order for resumed multi-file drafts that omitted it", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-1",
                    kind: "code_input",
                    title: "Create and inspect",
                    prompt: "Create a table and inspect it.",
                    starterCode: "-- Write the query\n",
                    solutionCode: "SELECT name FROM sqlite_master;\n",
                    recipeType: "sql_query",
                    datasetId: "ddl_blank",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "query.sql",
                            content: "-- Write the query\n",
                            language: "sql",
                            isEntry: true,
                        },
                        {
                            path: "schema.sql",
                            content: "-- Create the table\n",
                            language: "sql",
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "query.sql",
                            content: "SELECT name FROM sqlite_master;\n",
                            language: "sql",
                            isEntry: true,
                        },
                        {
                            path: "schema.sql",
                            content:
                                "CREATE TABLE products (id INTEGER PRIMARY KEY);\n",
                            language: "sql",
                        },
                    ],
                    hint: "Create first, then inspect.",
                    help: {
                        concept: "DDL file order",
                        hint_1: "Run schema.sql first.",
                        hint_2: "Run query.sql second.",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.sqlFileOrder).toEqual([
            "schema.sql",
            "query.sql",
        ]);
    });

    it("does not invent sqlFileOrder for single-file SQL exercises", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-1",
                    kind: "code_input",
                    title: "Inspect",
                    prompt: "Inspect the table.",
                    starterCode: "-- Write the query\n",
                    solutionCode: "SELECT * FROM products;\n",
                    recipeType: "sql_query",
                    datasetId: "products_catalog",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "query.sql",
                            content: "-- Write the query\n",
                            language: "sql",
                            isEntry: true,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "query.sql",
                            content: "SELECT * FROM products;\n",
                            language: "sql",
                            isEntry: true,
                        },
                    ],
                    hint: "Select the rows.",
                    help: {
                        concept: "Single-file query",
                        hint_1: "Use SELECT.",
                        hint_2: "Name the table.",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.sqlFileOrder).toBeUndefined();
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

    it("drops fixed tests from semantic code_input exercises", () => {
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
                    starterCode: "class Car:\n    pass\n",
                    solutionCode: "class Car:\n    pass\n",
                    recipeType: "semantic",
                    tests: [
                        {
                            stdin: "",
                            stdout: "ok\n",
                            match: "exact",
                        },
                    ],
                    semanticChecks: [
                        {
                            type: "defines_class",
                            className: "Car",
                        },
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
        expect(exercise.recipeType).toBe("semantic");
        expect(exercise.semanticChecks).toHaveLength(1);
        expect(exercise.tests).toBeUndefined();
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
