import { z } from "zod";
import {
    PROGRAMMING_LANGUAGES,
    makeProgrammingExpected,
    type ProgrammingExpected,
    type ProgrammingExpectedInput,
} from "./types.js";

export const ProgrammingLanguageSchema = z.enum(PROGRAMMING_LANGUAGES);

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(JsonValueSchema),
        z.record(JsonValueSchema),
    ]),
);
const SemanticValueKindSchema = z.enum([
    "value",
    "dict_entries",
    "list_of_dict_entries",
]);
const ProgrammingCodeFileSchema = z.object({
    path: z.string().min(1),
    content: z.string().default(""),
    readOnly: z.boolean().optional(),
});

export const ProgrammingCodeTestSchema = z.object({
    stdin: z.string().optional().default(""),
    stdout: z.string().optional().default(""),
    match: z.enum(["exact", "includes"]).optional().default("exact"),
    files: z.array(ProgrammingCodeFileSchema).optional(),
});

const WorkspaceExpectationsSchema = z.object({
    entryFilePath: z.string().optional(),
    requiredFiles: z.array(z.string()).optional(),
    requiredFolders: z.array(z.string()).optional(),
    forbiddenFiles: z.array(z.string()).optional(),
});

export const SemanticCheckSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("function_returns"),
        functionName: z.string().min(1),
        args: z.array(JsonValueSchema).optional().default([]),
        argKinds: z.array(SemanticValueKindSchema).optional().default([]),
        expected: JsonValueSchema,
        expectedKind: SemanticValueKindSchema.optional(),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("no_stdout"),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("defines_class"),
        className: z.string().min(1),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("constructible"),
        className: z.string().min(1),
        constructorArgs: z.array(JsonValueSchema).optional().default([]),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("instance_attributes"),
        className: z.string().min(1),
        constructorArgs: z.array(JsonValueSchema).optional().default([]),
        attributes: z.array(z.string().min(1)).min(1),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("method_returns"),
        className: z.string().min(1),
        constructorArgs: z.array(JsonValueSchema).optional().default([]),
        constructorArgKinds: z.array(SemanticValueKindSchema).optional().default([]),
        methodName: z.string().min(1),
        methodArgs: z.array(JsonValueSchema).optional().default([]),
        methodArgKinds: z.array(SemanticValueKindSchema).optional().default([]),
        expected: JsonValueSchema,
        expectedKind: SemanticValueKindSchema.optional(),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("created_instances"),
        className: z.string().min(1),
        min: z.number().int().min(1).default(1),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal("printed_line_count"),
        min: z.number().int().min(1).default(1),
        message: z.string().optional(),
    }),
]);

export const ProgrammingExpectedSchema = z
    .object({
        kind: z.literal("code_input"),
        language: ProgrammingLanguageSchema.optional(),
        checkMode: z.enum(["stdout", "semantic"]).optional(),
        tests: z.array(ProgrammingCodeTestSchema).optional(),
        stdin: z.string().optional(),
        stdout: z.string().optional(),
        match: z.enum(["exact", "includes"]).optional(),
        semanticChecks: z.array(SemanticCheckSchema).optional(),
        workspaceExpectations: WorkspaceExpectationsSchema.optional(),
        solutionCode: z.string().optional(),
    })
    .transform((value): ProgrammingExpected =>
        makeProgrammingExpected(value as ProgrammingExpectedInput),
    )
    .superRefine((value: ProgrammingExpected, ctx) => {
        if (value.checkMode === "semantic") {
            if (
                !Array.isArray(value.semanticChecks) ||
                value.semanticChecks.length < 1
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["semanticChecks"],
                    message:
                        "semantic code_input expected must include semanticChecks[].",
                });
            }
            return;
        }

        if (!Array.isArray(value.tests) || value.tests.length < 1) {
            ctx.addIssue({
                code: "custom",
                path: ["tests"],
                message: "programming code_input expected must include tests[]",
            });
        }
    });