import {
    type HiddenShellCheck,
    SemanticCheckSchema,
    type SemanticCheck,
    type TerminalExpectations,
} from "@zoeskoul/practice-checks";
import {
    type GitExpectations,
    normalizeGitExpectations,
} from "./git-expectations.js";
import {
    normalizeHiddenShellCheck,
    normalizeTerminalExpectations,
} from "./terminal-expectations.js";
import type {
    ExerciseKind,
    ManifestFileFixture,
    ManifestWorkspaceExpectations,
    WorkspaceLanguage,
} from "./manifest.js";
import {
    normalizeWorkspaceExpectations,
    normalizeWorkspacePath,
} from "./workspace-path.js";
import {countFillBlanks} from "./fillBlank/fillBlankText.js";
import type { ToolPresentationPolicy } from "./tool-presentation.js";
export type ExerciseHelpDraft = {
    concept: string;
    hint_1: string;
    hint_2: string;
};

export type ProgrammingCodeInputTestDraft = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
    files?: ProgrammingCodeInputFileDraft[];
};

export type ProgrammingCodeInputFileDraft = ManifestFileFixture;

type DraftCommon = {
    id: string;
    /** Optional exercise-level Tools presentation override. */
    tools?: ToolPresentationPolicy;
    title: string;
    prompt: string;
    hint: string;
    help: ExerciseHelpDraft;
};

export type ProgrammingCodeInputStarterFileDraft = {
    /**
     * Workspace-relative file path. Supports folders:
     * - "main.py"
     * - "src/main.py"
     * - "helpers/math_utils.py"
     */
    path: string;

    content: string;
    language?: WorkspaceLanguage;
    isEntry?: boolean;
    entry?: boolean;
    readOnly?: boolean;
};

export type ProgrammingCodeInputSourceCheckDraft = {
    type: "source_contains" | "source_regex";
    pattern: string;
    message: string;
    normalizeWhitespace?: boolean;
};

export type TopicAuthoringDraft = {
    title: string;
    summary: string;
    minutes: number;

    sketchBlocks: Array<{
        id: string;
        /** Navigation/lesson title shown above the card. */
        cardTitle?: string;
        /** Inner heading that introduces the body prose. */
        title: string;
        bodyMarkdown: string;
        /** Optional lesson/card-level Tools presentation override. */
        tools?: ToolPresentationPolicy;
    }>;

    /**
     * Authoring input still uses quizDraft as the general exercise pool.
     *
     * Final publishing rule:
     * - code_input becomes project practice.
     * - non-code exercises become quiz practice.
     */
    quizDraft: Array<
        | (DraftCommon & {
        kind: "single_choice";
        options: string[];
        correctOptionIds: string[];
    })
        | (DraftCommon & {
        kind: "multi_choice";
        options: string[];
        correctOptionIds: string[];
    })
        | (DraftCommon & {
        kind: "drag_reorder";
        tokens: string[];
        correctOrder: string[];
    })
        | (DraftCommon & {
        kind: "fill_blank_choice";
        template: string;
        choices: string[];
        correctValue: string;
    })
        | (DraftCommon & {
        kind: "code_input";
        starterCode: string;
        fixedLanguage?: WorkspaceLanguage;

        /**
         * Optional explicit entry file. Use this when starterFiles contains
         * multiple files or nested folders, for example "src/main.py".
         */
        entryFilePath?: string;

        /**
         * Optional learner-editable starter files. Use slash paths to create folders.
         * If omitted, starterCode is emitted as the default entry file.
         */
        starterFiles?: ProgrammingCodeInputStarterFileDraft[];
        workspaceExpectations?: ManifestWorkspaceExpectations;
        terminalExpectations?: TerminalExpectations;
        hiddenShellCheck?: HiddenShellCheck;
        gitExpectations?: GitExpectations;
        solutionFiles?: ProgrammingCodeInputStarterFileDraft[];
        /** Ordered SQL workspace execution paths, for example schema.sql, seed.sql, query.sql. */
        sqlFileOrder?: string[];
        sourceChecks?: ProgrammingCodeInputSourceCheckDraft[];

        solutionCode: string;
        tests?: ProgrammingCodeInputTestDraft[];
        files?: ProgrammingCodeInputFileDraft[];
        semanticChecks?: SemanticCheck[];
        datasetId?: string;
        recipeType?: "sql_query" | "template_io" | "fixed_tests" | "semantic" | "shell_task";
        mode?: "terminal_workspace" | "stdout" | "workspace_and_stdout";
        instructions?: string;
        checkSql?: string;

    })
    >;

    /**
     * Optional authoring hint.
     *
     * The compiler will auto-create a project card for all code_input exercises,
     * even if this is missing.
     */
    projectDraft?: {
        title: string;
        stepIds: string[];
    };
};

type JsonSchema = Record<string, unknown>;

const EXERCISE_KIND_ENUM = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
] satisfies ExerciseKind[];

const RECIPE_TYPE_ENUM = [
    "sql_query",
    "template_io",
    "fixed_tests",
    "semantic",
    "shell_task",
] as const;

const helpSchema = {
    type: "object",
    additionalProperties: false,
    required: ["concept", "hint_1", "hint_2"],
    properties: {
        concept: { type: "string" },
        hint_1: { type: "string" },
        hint_2: { type: "string" },
    },
} satisfies JsonSchema;

const toolPresentationSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        defaultVisible: { type: "boolean" },
        allowOpen: { type: "boolean" },
        defaultSurface: { type: "string", enum: ["editor", "results"] },
        compactDefaultSurface: { type: "string", enum: ["editor", "results"] },
        runnerPane: {
            type: "object",
            additionalProperties: false,
            properties: {
                defaultTab: { type: "string", enum: ["output", "terminal"] },
                compactDefaultTab: { type: "string", enum: ["output", "terminal"] },
            },
        },
        sqlPane: {
            type: "object",
            additionalProperties: false,
            properties: {
                showResults: { type: "boolean" },
                showTables: { type: "boolean" },
                showErd: { type: "boolean" },
                showCrowFoot: { type: "boolean" },
                showCrowfoot: { type: "boolean" },
                showCrowsFoot: { type: "boolean" },
                showChen: { type: "boolean" },
                defaultTab: { type: "string", enum: ["results", "tables", "erd", "chen"] },
                compactDefaultTab: { type: "string", enum: ["results", "tables", "erd", "chen"] },
            },
        },
    },
} satisfies JsonSchema;

const draftCommonSchema = {
    id: { type: "string" },
    kind: { type: "string", enum: EXERCISE_KIND_ENUM },
    title: { type: "string" },
    prompt: { type: "string" },
    hint: { type: "string" },
    help: helpSchema,
    tools: toolPresentationSchema,
} satisfies JsonSchema;

export const TOPIC_AUTHORING_DRAFT_SCHEMA_VERSION =
    "2026-07-16-topic-authoring-draft-v2";

export const TOPIC_AUTHORING_DRAFT_JSON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "minutes", "sketchBlocks", "quizDraft"],
    properties: {
        title: { type: "string" },
        summary: { type: "string" },
        minutes: { type: "number" },
        sketchBlocks: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "title", "bodyMarkdown"],
                properties: {
                    id: { type: "string" },
                    cardTitle: { type: "string" },
                    title: { type: "string" },
                    bodyMarkdown: { type: "string" },
                    tools: toolPresentationSchema,
                },
            },
        },
        quizDraft: {
            type: "array",
            items: {
                oneOf: [
                    {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "kind",
                            "title",
                            "prompt",
                            "hint",
                            "help",
                            "options",
                            "correctOptionIds",
                        ],
                        properties: {
                            ...draftCommonSchema,
                            kind: { const: "single_choice" },
                            options: { type: "array", items: { type: "string" } },
                            correctOptionIds: {
                                type: "array",
                                items: { type: "string" },
                            },
                        },
                    },
                    {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "kind",
                            "title",
                            "prompt",
                            "hint",
                            "help",
                            "options",
                            "correctOptionIds",
                        ],
                        properties: {
                            ...draftCommonSchema,
                            kind: { const: "multi_choice" },
                            options: { type: "array", items: { type: "string" } },
                            correctOptionIds: {
                                type: "array",
                                items: { type: "string" },
                            },
                        },
                    },
                    {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "kind",
                            "title",
                            "prompt",
                            "hint",
                            "help",
                            "tokens",
                            "correctOrder",
                        ],
                        properties: {
                            ...draftCommonSchema,
                            kind: { const: "drag_reorder" },
                            tokens: { type: "array", items: { type: "string" } },
                            correctOrder: {
                                type: "array",
                                items: { type: "string" },
                            },
                        },
                    },
                    {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "kind",
                            "title",
                            "prompt",
                            "hint",
                            "help",
                            "template",
                            "choices",
                            "correctValue",
                        ],
                        properties: {
                            ...draftCommonSchema,
                            kind: { const: "fill_blank_choice" },
                            template: { type: "string" },
                            choices: { type: "array", items: { type: "string" } },
                            correctValue: { type: "string" },
                        },
                    },
                    {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "kind",
                            "title",
                            "prompt",
                            "hint",
                            "help",
                            "starterCode",
                            "solutionCode",
                        ],
                        properties: {
                            ...draftCommonSchema,
                            kind: { const: "code_input" },
                            starterCode: { type: "string" },
                            solutionCode: { type: "string" },
                            fixedLanguage: { type: "string" },
                            tests: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["stdout"],
                                    properties: {
                                        stdin: { type: "string" },
                                        stdout: { type: "string" },
                                        match: {
                                            type: "string",
                                            enum: ["exact", "includes"],
                                        },
                                        files: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                additionalProperties: false,
                                                required: ["path", "content"],
                                                properties: {
                                                    path: { type: "string" },
                                                    content: { type: "string" },
                                                    readOnly: { type: "boolean" },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            files: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["path", "content"],
                                    properties: {
                                        path: { type: "string" },
                                        content: { type: "string" },
                                        readOnly: { type: "boolean" },
                                    },
                                },
                            },
                            semanticChecks: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: true,
                                },
                            },
                            entryFilePath: { type: "string" },
                            starterFiles: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["path", "content"],
                                    properties: {
                                        path: { type: "string" },
                                        content: { type: "string" },
                                        language: { type: "string" },
                                        isEntry: { type: "boolean" },
                                        entry: { type: "boolean" },
                                        readOnly: { type: "boolean" },
                                    },
                                },
                            },
                            solutionFiles: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["path", "content"],
                                    properties: {
                                        path: { type: "string" },
                                        content: { type: "string" },
                                        language: { type: "string" },
                                        isEntry: { type: "boolean" },
                                        entry: { type: "boolean" },
                                        readOnly: { type: "boolean" },
                                    },
                                },
                            },
                            sqlFileOrder: {
                                type: "array",
                                items: { type: "string" },
                            },
                            sourceChecks: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["type", "pattern", "message"],
                                    properties: {
                                        type: {
                                            type: "string",
                                            enum: ["source_contains", "source_regex"],
                                        },
                                        pattern: { type: "string" },
                                        message: { type: "string" },
                                        normalizeWhitespace: { type: "boolean" },
                                    },
                                },
                            },
                            workspaceExpectations: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    entryFilePath: { type: "string" },
                                    requiredFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    requiredFolders: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    forbiddenFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                },
                            },
                            terminalExpectations: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    requiredCommands: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["pattern"],
                                            properties: {
                                                pattern: { type: "string" },
                                                message: { type: "string" },
                                            },
                                        },
                                    },
                                    forbiddenCommands: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["pattern"],
                                            properties: {
                                                pattern: { type: "string" },
                                                message: { type: "string" },
                                            },
                                        },
                                    },
                                    outputContains: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    outputRegex: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    cwdContains: { type: "string" },
                                    cwdEndsWith: { type: "string" },
                                },
                            },
                            hiddenShellCheck: {
                                type: "object",
                                additionalProperties: false,
                                required: ["script"],
                                properties: {
                                    script: { type: "string" },
                                    timeoutMs: { type: "number" },
                                },
                            },
                            gitExpectations: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    repositoryPath: { type: "string" },
                                    repositoryInitialized: { type: "boolean" },
                                    currentBranch: { type: "string" },
                                    cleanWorkingTree: { type: "boolean" },
                                    minimumCommitCount: {
                                        type: "integer",
                                        minimum: 0,
                                    },
                                    exactCommitCount: {
                                        type: "integer",
                                        minimum: 0,
                                    },
                                    trackedFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    untrackedFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    ignoredFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    forbiddenTrackedFiles: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    requiredBranches: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    forbiddenBranches: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                    commitMessages: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["matches"],
                                            properties: {
                                                position: {
                                                    type: "integer",
                                                    minimum: 0,
                                                },
                                                matches: { type: "string" },
                                                message: { type: "string" },
                                            },
                                        },
                                    },
                                    headFiles: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["path"],
                                            properties: {
                                                path: { type: "string" },
                                                contains: { type: "string" },
                                                equals: { type: "string" },
                                                message: { type: "string" },
                                            },
                                        },
                                    },
                                    remotes: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["name"],
                                            properties: {
                                                name: { type: "string" },
                                                urlContains: { type: "string" },
                                                requiredBranches: {
                                                    type: "array",
                                                    items: { type: "string" },
                                                },
                                                message: { type: "string" },
                                            },
                                        },
                                    },
                                },
                            },
                            datasetId: { type: "string" },
                            recipeType: {
                                type: "string",
                                enum: RECIPE_TYPE_ENUM,
                            },
                            mode: {
                                type: "string",
                                enum: ["terminal_workspace", "stdout", "workspace_and_stdout"],
                            },
                            instructions: { type: "string" },
                            checkSql: { type: "string" },
                        },
                    },
                ],
            },
        },
        projectDraft: {
            type: "object",
            additionalProperties: false,
            required: ["title", "stepIds"],
            properties: {
                title: { type: "string" },
                stepIds: {
                    type: "array",
                    items: { type: "string" },
                },
            },
        },
    },
} satisfies JsonSchema;

type TopicAuthoringDraftValidationResult = {
    ok: boolean;
    errors: string[];
};

function fail(message: string): never {
    throw new Error(`Invalid TopicAuthoringDraft: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
function assertWorkspacePath(value: unknown, label: string): string {
    if (!isNonEmptyString(value)) {
        fail(`${label} must be a non-empty workspace-relative path`);
    }

    try {
        return normalizeWorkspacePath(value);
    } catch (error) {
        fail(`${label} is invalid: ${(error as Error).message}`);
    }
}

function assertFileDraft(
    file: unknown,
    label: string,
    allowedKeys = ["path", "content", "readOnly"],
) {
    if (!isRecord(file)) {
        fail(`${label} must be an object`);
    }

    assertOnlyKeys(file, allowedKeys, label);
    assertWorkspacePath(file.path, `${label}.path`);

    if (typeof file.content !== "string") {
        fail(`${label}.content must be a string`);
    }

    if (
        typeof file.readOnly !== "undefined" &&
        typeof file.readOnly !== "boolean"
    ) {
        fail(`${label}.readOnly must be a boolean when provided`);
    }
}

function assertWorkspaceExpectations(value: unknown, label: string) {
    if (!isRecord(value)) {
        fail(`${label} must be an object`);
    }

    assertOnlyKeys(
        value,
        ["entryFilePath", "requiredFiles", "requiredFolders", "forbiddenFiles"],
        label,
    );

    try {
        normalizeWorkspaceExpectations(value, label);
    } catch (error) {
        fail((error as Error).message);
    }
}


function assertTerminalExpectations(value: unknown, label: string) {
    try {
        normalizeTerminalExpectations(value, label);
    } catch (error) {
        fail((error as Error).message);
    }
}

function assertHiddenShellCheck(value: unknown, label: string) {
    try {
        normalizeHiddenShellCheck(value, label);
    } catch (error) {
        fail((error as Error).message);
    }
}

function assertGitExpectations(value: unknown, label: string) {
    try {
        normalizeGitExpectations(value, label);
    } catch (error) {
        fail((error as Error).message);
    }
}

function assertOnlyKeys(
    value: Record<string, unknown>,
    allowedKeys: string[],
    label: string,
) {
    const extras = Object.keys(value).filter((key) => !allowedKeys.includes(key));
    if (extras.length > 0) {
        fail(`${label} has unknown field(s): ${extras.join(", ")}`);
    }
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function assertHelp(
    help: unknown,
    label: string,
): asserts help is ExerciseHelpDraft {
    if (!isRecord(help)) {
        fail(`${label} needs help`);
    }

    assertOnlyKeys(help, ["concept", "hint_1", "hint_2"], `${label} help`);

    if (!isNonEmptyString(help.concept)) {
        fail(`${label} help.concept must be a non-empty string`);
    }

    if (!isNonEmptyString(help.hint_1)) {
        fail(`${label} help.hint_1 must be a non-empty string`);
    }

    if (!isNonEmptyString(help.hint_2)) {
        fail(`${label} help.hint_2 must be a non-empty string`);
    }
}



export function assertTopicAuthoringDraft(
    draft: TopicAuthoringDraft,
): asserts draft is TopicAuthoringDraft {
    if (!isRecord(draft)) {
        fail("value is not an object");
    }

    assertOnlyKeys(
        draft,
        ["title", "summary", "minutes", "sketchBlocks", "quizDraft", "projectDraft"],
        "draft",
    );

    if (!isNonEmptyString(draft.title)) {
        fail("title must be a non-empty string");
    }

    if (!isNonEmptyString(draft.summary)) {
        fail("summary must be a non-empty string");
    }

    if (
        typeof draft.minutes !== "number" ||
        !Number.isFinite(draft.minutes) ||
        draft.minutes <= 0
    ) {
        fail("minutes must be a positive number");
    }

    if (!Array.isArray(draft.sketchBlocks)) {
        fail("sketchBlocks must be an array");
    }

    draft.sketchBlocks.forEach((block, i) => {
        if (!isRecord(block)) {
            fail(`sketchBlocks[${i}] must be an object`);
        }

        assertOnlyKeys(
            block,
            ["id", "cardTitle", "title", "bodyMarkdown", "tools"],
            `sketchBlocks[${i}]`,
        );

        if (!isNonEmptyString(block.id)) {
            fail(`sketchBlocks[${i}] needs id`);
        }
        if (block.cardTitle !== undefined && !isNonEmptyString(block.cardTitle)) {
            fail(`sketchBlocks[${i}].cardTitle must be a non-empty string when provided`);
        }
        if (!isNonEmptyString(block.title)) {
            fail(`sketchBlocks[${i}] needs title`);
        }
        if (!isNonEmptyString(block.bodyMarkdown)) {
            fail(`sketchBlocks[${i}] needs bodyMarkdown`);
        }
    });

    if (!Array.isArray(draft.quizDraft)) {
        fail("quizDraft must be an array");
    }

    draft.quizDraft.forEach((exercise, i) => {
        const label = `quizDraft[${i}]`;

        if (!isRecord(exercise)) {
            fail(`${label} must be an object`);
        }

        if (!isNonEmptyString(exercise.id)) {
            fail(`${label} needs id`);
        }
        if (!isNonEmptyString(exercise.title)) {
            fail(`${label} needs title`);
        }
        if (!isNonEmptyString(exercise.prompt)) {
            fail(`${label} needs prompt`);
        }
        if (!isNonEmptyString(exercise.hint)) {
            fail(`${label} needs hint`);
        }

        assertHelp(exercise.help, label);

        if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
            assertOnlyKeys(
                exercise,
                ["id", "kind", "title", "prompt", "hint", "help", "options", "correctOptionIds"],
                label,
            );

            if (!Array.isArray(exercise.options) || exercise.options.length < 2) {
                fail(`${label} ${exercise.kind} needs at least 2 options`);
            }

            if (exercise.options.some((opt) => !isNonEmptyString(opt))) {
                fail(`${label} ${exercise.kind} options must be non-empty strings`);
            }

            if (
                !Array.isArray(exercise.correctOptionIds) ||
                exercise.correctOptionIds.some((id) => !isNonEmptyString(id))
            ) {
                fail(`${label} ${exercise.kind} correctOptionIds must be non-empty strings`);
            }

            const allowedOptionIds = canonicalOptionIds(exercise.options.length);

            if (exercise.kind === "single_choice" && exercise.correctOptionIds.length !== 1) {
                fail(`${label} single_choice needs exactly 1 correctOptionIds entry`);
            }

            if (exercise.kind === "multi_choice" && exercise.correctOptionIds.length < 1) {
                fail(`${label} multi_choice needs at least 1 correctOptionIds entry`);
            }

            if (!exercise.correctOptionIds.every((id) => allowedOptionIds.includes(id))) {
                fail(
                    `${label} ${exercise.kind} correctOptionIds must be included in available options (${allowedOptionIds.join(", ")})`,
                );
            }

            return;
        }

        if (exercise.kind === "drag_reorder") {
            assertOnlyKeys(
                exercise,
                ["id", "kind", "title", "prompt", "hint", "help", "tokens", "correctOrder"],
                label,
            );

            if (!Array.isArray(exercise.tokens) || exercise.tokens.length < 2) {
                fail(`${label} drag_reorder needs at least 2 tokens`);
            }

            if (exercise.tokens.some((token) => !isNonEmptyString(token))) {
                fail(`${label} drag_reorder tokens must be non-empty strings`);
            }

            if (
                !Array.isArray(exercise.correctOrder) ||
                exercise.correctOrder.length !== exercise.tokens.length
            ) {
                fail(`${label} drag_reorder correctOrder must have same length as tokens`);
            }

            if (exercise.correctOrder.some((token) => !isNonEmptyString(token))) {
                fail(`${label} drag_reorder correctOrder must be non-empty strings`);
            }

            const tokenSet = new Set(exercise.tokens.map((token) => token.trim()));

            if (!exercise.correctOrder.every((token) => tokenSet.has(token.trim()))) {
                fail(`${label} drag_reorder correctOrder must only contain values from tokens`);
            }

            return;
        }

        if (exercise.kind === "fill_blank_choice") {
            assertOnlyKeys(
                exercise,
                ["id", "kind", "title", "prompt", "hint", "help", "template", "choices", "correctValue"],
                label,
            );

            if (!isNonEmptyString(exercise.template)) {
                fail(`${label} fill_blank_choice needs template`);
            }

            const blankCount = countFillBlanks(exercise.template, exercise.prompt);

            if (blankCount === 0) {
                fail(`${label} fill_blank_choice needs exactly 1 blank placeholder`);
            }

            if (blankCount > 1) {
                fail(`${label} fill_blank_choice supports only 1 blank, but found ${blankCount}`);
            }

            if (!Array.isArray(exercise.choices) || exercise.choices.length < 2) {
                fail(`${label} fill_blank_choice needs at least 2 choices`);
            }

            if (exercise.choices.some((choice) => !isNonEmptyString(choice))) {
                fail(`${label} fill_blank_choice choices must be non-empty strings`);
            }

            if (!isNonEmptyString(exercise.correctValue)) {
                fail(`${label} fill_blank_choice needs correctValue`);
            }

            if (!exercise.choices.some((choice) => choice.trim() === exercise.correctValue.trim())) {
                fail(`${label} fill_blank_choice correctValue must be included in choices`);
            }

            return;
        }

        if (exercise.kind === "code_input") {
            assertOnlyKeys(
                exercise,
                [

                        "id",
                        "kind",
                        "title",
                        "prompt",
                        "hint",
                        "help",
                        "starterCode",
                        "fixedLanguage",
                        "entryFilePath",
                        "starterFiles",
                        "solutionFiles",
                        "sqlFileOrder",
                        "sourceChecks",
                        "workspaceExpectations",
                        "terminalExpectations",
                        "hiddenShellCheck",
                        "gitExpectations",
                        "solutionCode",
                        "tests",
                        "files",
                        "semanticChecks",
                        "datasetId",
                        "recipeType",
                        "mode",
                        "instructions",
                        "checkSql",
                ],
                label,
            );

            if (!isNonEmptyString(exercise.starterCode)) {
                fail(`${label} code_input needs starterCode`);
            }

            if (!isNonEmptyString(exercise.solutionCode)) {
                fail(`${label} code_input needs solutionCode`);
            }

            if (
                typeof exercise.datasetId !== "undefined" &&
                !isNonEmptyString(exercise.datasetId)
            ) {
                fail(`${label} code_input datasetId must be non-empty when provided`);
            }

            if (
                typeof exercise.checkSql !== "undefined" &&
                !isNonEmptyString(exercise.checkSql)
            ) {
                fail(`${label} code_input checkSql must be non-empty when provided`);
            }

            if (
                typeof exercise.recipeType !== "undefined" &&
                !RECIPE_TYPE_ENUM.includes(exercise.recipeType)
            ) {
                fail(`${label} code_input recipeType is invalid`);
            }

            if (
                typeof exercise.mode !== "undefined" &&
                exercise.mode !== "terminal_workspace" &&
                exercise.mode !== "stdout" &&
                exercise.mode !== "workspace_and_stdout"
            ) {
                fail(`${label} code_input mode is invalid`);
            }

            if (
                typeof exercise.instructions !== "undefined" &&
                !isNonEmptyString(exercise.instructions)
            ) {
                fail(`${label} code_input instructions must be non-empty when provided`);
            }



            if (typeof exercise.entryFilePath !== "undefined") {
                assertWorkspacePath(exercise.entryFilePath, `${label}.entryFilePath`);
            }

            if (typeof exercise.workspaceExpectations !== "undefined") {
                assertWorkspaceExpectations(
                    exercise.workspaceExpectations,
                    `${label}.workspaceExpectations`,
                );
            }

            if (typeof exercise.terminalExpectations !== "undefined") {
                assertTerminalExpectations(
                    exercise.terminalExpectations,
                    `${label}.terminalExpectations`,
                );

                if (
                    exercise.recipeType !== "shell_task" ||
                    exercise.mode !== "terminal_workspace"
                ) {
                    fail(
                        `${label} terminalExpectations is only supported for shell_task terminal_workspace exercises`,
                    );
                }
            }

            if (typeof exercise.hiddenShellCheck !== "undefined") {
                assertHiddenShellCheck(
                    exercise.hiddenShellCheck,
                    `${label}.hiddenShellCheck`,
                );

                if (
                    exercise.recipeType !== "shell_task" ||
                    exercise.mode !== "terminal_workspace"
                ) {
                    fail(
                        `${label} hiddenShellCheck is only supported for shell_task terminal_workspace exercises`,
                    );
                }
            }

            if (typeof exercise.gitExpectations !== "undefined") {
                assertGitExpectations(
                    exercise.gitExpectations,
                    `${label}.gitExpectations`,
                );

                if (
                    exercise.recipeType !== "shell_task" ||
                    exercise.mode !== "terminal_workspace"
                ) {
                    fail(
                        `${label} gitExpectations is only supported for shell_task terminal_workspace exercises`,
                    );
                }

                if (
                    typeof exercise.fixedLanguage !== "undefined" &&
                    exercise.fixedLanguage !== "bash"
                ) {
                    fail(`${label} gitExpectations requires fixedLanguage "bash"`);
                }
            }

            if (typeof exercise.starterFiles !== "undefined") {
                if (!Array.isArray(exercise.starterFiles)) {
                    fail(`${label} code_input starterFiles must be an array when provided`);
                }

                exercise.starterFiles.forEach((file, fileIndex) => {
                    assertFileDraft(
                        file,
                        `${label} starterFiles[${fileIndex}]`,
                        ["path", "content", "language", "isEntry", "entry", "readOnly"],
                    );

                    const record = file as Record<string, unknown>;

                    if (
                        typeof record.language !== "undefined" &&
                        typeof record.language !== "string"
                    ) {
                        fail(`${label} starterFiles[${fileIndex}].language must be a string when provided`);
                    }

                    if (
                        typeof record.isEntry !== "undefined" &&
                        typeof record.isEntry !== "boolean"
                    ) {
                        fail(`${label} starterFiles[${fileIndex}].isEntry must be a boolean when provided`);
                    }

                    if (
                        typeof record.entry !== "undefined" &&
                        typeof record.entry !== "boolean"
                    ) {
                        fail(`${label} starterFiles[${fileIndex}].entry must be a boolean when provided`);
                    }
                });
            }

            if (typeof exercise.solutionFiles !== "undefined") {
                if (!Array.isArray(exercise.solutionFiles)) {
                    fail(`${label} code_input solutionFiles must be an array when provided`);
                }

                exercise.solutionFiles.forEach((file, fileIndex) => {
                    assertFileDraft(
                        file,
                        `${label} solutionFiles[${fileIndex}]`,
                        ["path", "content", "language", "isEntry", "entry", "readOnly"],
                    );

                    const record = file as Record<string, unknown>;

                    if (
                        typeof record.language !== "undefined" &&
                        typeof record.language !== "string"
                    ) {
                        fail(`${label} solutionFiles[${fileIndex}].language must be a string when provided`);
                    }

                    if (
                        typeof record.isEntry !== "undefined" &&
                        typeof record.isEntry !== "boolean"
                    ) {
                        fail(`${label} solutionFiles[${fileIndex}].isEntry must be a boolean when provided`);
                    }

                    if (
                        typeof record.entry !== "undefined" &&
                        typeof record.entry !== "boolean"
                    ) {
                        fail(`${label} solutionFiles[${fileIndex}].entry must be a boolean when provided`);
                    }
                });
            }

            if (typeof exercise.sqlFileOrder !== "undefined") {
                if (
                    !Array.isArray(exercise.sqlFileOrder) ||
                    exercise.sqlFileOrder.length < 1 ||
                    exercise.sqlFileOrder.some((path) => !isNonEmptyString(path))
                ) {
                    fail(`${label} code_input sqlFileOrder must be a non-empty array of workspace-relative paths when provided`);
                }

                exercise.sqlFileOrder.forEach((path, pathIndex) => {
                    assertWorkspacePath(path, `${label}.sqlFileOrder[${pathIndex}]`);
                });

                if (new Set(exercise.sqlFileOrder.map((path) => path.trim())).size !== exercise.sqlFileOrder.length) {
                    fail(`${label} code_input sqlFileOrder must not contain duplicate paths`);
                }

                if (exercise.recipeType !== "sql_query") {
                    fail(`${label} code_input sqlFileOrder is only supported for sql_query exercises`);
                }

                const orderedPaths = exercise.sqlFileOrder.map((path) => path.trim());
                const solutionPaths = Array.isArray(exercise.solutionFiles)
                    ? exercise.solutionFiles.map((file) => file.path.trim())
                    : [];
                if (
                    solutionPaths.length > 0 &&
                    (orderedPaths.length !== solutionPaths.length ||
                        solutionPaths.some((path) => !orderedPaths.includes(path)))
                ) {
                    fail(`${label} code_input sqlFileOrder must list every solutionFiles path exactly once`);
                }

                if (
                    typeof exercise.entryFilePath === "string" &&
                    !orderedPaths.includes(exercise.entryFilePath.trim())
                ) {
                    fail(`${label} code_input sqlFileOrder must include entryFilePath`);
                }
            }

            if (
                exercise.recipeType === "sql_query" &&
                Array.isArray(exercise.starterFiles) &&
                Array.isArray(exercise.solutionFiles)
            ) {
                const starterPaths = exercise.starterFiles.map((file) => file.path.trim());
                const solutionPaths = exercise.solutionFiles.map((file) => file.path.trim());
                if (
                    starterPaths.length !== solutionPaths.length ||
                    starterPaths.some((path) => !solutionPaths.includes(path))
                ) {
                    fail(`${label} SQL starterFiles and solutionFiles must describe the same workspace paths`);
                }
            }

            if (typeof exercise.sourceChecks !== "undefined") {
                if (!Array.isArray(exercise.sourceChecks)) {
                    fail(`${label} code_input sourceChecks must be an array when provided`);
                }

                exercise.sourceChecks.forEach((check, checkIndex) => {
                    if (!check || typeof check !== "object" || Array.isArray(check)) {
                        fail(`${label} sourceChecks[${checkIndex}] must be an object`);
                        return;
                    }

                    const record = check as Record<string, unknown>;
                    assertOnlyKeys(
                        record,
                        ["type", "pattern", "message", "normalizeWhitespace"],
                        `${label}.sourceChecks[${checkIndex}]`,
                    );

                    if (
                        record.type !== "source_contains" &&
                        record.type !== "source_regex"
                    ) {
                        fail(`${label} sourceChecks[${checkIndex}].type must be "source_contains" or "source_regex"`);
                    }

                    if (!isNonEmptyString(record.pattern)) {
                        fail(`${label} sourceChecks[${checkIndex}].pattern must be non-empty`);
                    }

                    if (!isNonEmptyString(record.message)) {
                        fail(`${label} sourceChecks[${checkIndex}].message must be non-empty`);
                    }

                    if (
                        typeof record.normalizeWhitespace !== "undefined" &&
                        typeof record.normalizeWhitespace !== "boolean"
                    ) {
                        fail(`${label} sourceChecks[${checkIndex}].normalizeWhitespace must be a boolean when provided`);
                    }
                });
            }



            if (typeof exercise.tests !== "undefined") {
                if (!Array.isArray(exercise.tests)) {
                    fail(`${label} code_input tests must be an array when provided`);
                }

                exercise.tests.forEach((test, testIndex) => {
                    if (!isRecord(test)) {
                        fail(`${label} tests[${testIndex}] must be an object`);
                    }

                    assertOnlyKeys(
                        test,
                        ["stdin", "stdout", "match", "files"],
                        `${label} tests[${testIndex}]`,
                    );

                    if (
                        typeof test.stdin !== "undefined" &&
                        typeof test.stdin !== "string"
                    ) {
                        fail(`${label} tests[${testIndex}].stdin must be a string when provided`);
                    }

                    if (!isNonEmptyString(test.stdout)) {
                        fail(`${label} tests[${testIndex}].stdout must be a non-empty string`);
                    }

                    if (
                        typeof test.match !== "undefined" &&
                        test.match !== "exact" &&
                        test.match !== "includes"
                    ) {
                        fail(`${label} tests[${testIndex}].match must be "exact" or "includes"`);
                    }

                    if (typeof test.files !== "undefined") {
                        if (!Array.isArray(test.files)) {
                            fail(`${label} tests[${testIndex}].files must be an array when provided`);
                        }

                        test.files.forEach((file, fileIndex) => {
                            assertFileDraft(
                                file,
                                `${label} tests[${testIndex}].files[${fileIndex}]`,
                            );
                        });
                    }
                });
            }

            if (typeof exercise.semanticChecks !== "undefined") {
                const parsed = SemanticCheckSchema.array().safeParse(exercise.semanticChecks);

                if (!parsed.success) {
                    fail(`${label} semanticChecks must match the canonical semantic check schema`);
                }
            }

            if (typeof exercise.files !== "undefined") {
                if (!Array.isArray(exercise.files)) {
                    fail(`${label} code_input files must be an array when provided`);
                }

                exercise.files.forEach((file, fileIndex) => {
                    if (!isRecord(file)) {
                        fail(`${label} files[${fileIndex}] must be an object`);
                    }

                    assertOnlyKeys(file, ["path", "content", "readOnly"], `${label} files[${fileIndex}]`);

                    if (!isNonEmptyString(file.path)) {
                        fail(`${label} files[${fileIndex}].path must be a non-empty string`);
                    }

                    if (typeof file.content !== "string") {
                        fail(`${label} files[${fileIndex}].content must be a string`);
                    }

                    if (
                        typeof file.readOnly !== "undefined" &&
                        typeof file.readOnly !== "boolean"
                    ) {
                        fail(`${label} files[${fileIndex}].readOnly must be a boolean when provided`);
                    }
                });
            }

            const hasTests = Array.isArray(exercise.tests) && exercise.tests.length > 0;
            const hasSemanticChecks =
                Array.isArray(exercise.semanticChecks) && exercise.semanticChecks.length > 0;

            if (exercise.recipeType === "semantic" && !hasSemanticChecks) {
                fail(`${label} semantic code_input needs semanticChecks`);
            }

            if (exercise.recipeType === "fixed_tests" && !hasTests) {
                fail(`${label} fixed_tests code_input needs tests`);
            }

            if (
                exercise.recipeType !== "sql_query" &&
                exercise.recipeType !== "shell_task" &&
                !hasTests &&
                !hasSemanticChecks
            ) {
                fail(`${label} code_input needs either tests or semanticChecks`);
            }

            return;
        }

        fail(`${label} has unknown kind`);
    });

    if (typeof draft.projectDraft !== "undefined") {
        if (!isRecord(draft.projectDraft)) {
            fail("projectDraft must be an object");
        }

        assertOnlyKeys(draft.projectDraft, ["title", "stepIds"], "projectDraft");

        if (!isNonEmptyString(draft.projectDraft.title)) {
            fail("projectDraft needs title");
        }

        if (!Array.isArray(draft.projectDraft.stepIds)) {
            fail("projectDraft.stepIds must be an array");
        }

        if (draft.projectDraft.stepIds.some((id) => !isNonEmptyString(id))) {
            fail("projectDraft.stepIds must be non-empty strings");
        }
    }
}

export function validateTopicAuthoringDraft(
    value: unknown,
): TopicAuthoringDraftValidationResult {
    try {
        assertTopicAuthoringDraft(value as TopicAuthoringDraft);
        return {
            ok: true,
            errors: [],
        };
    } catch (error) {
        return {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}
