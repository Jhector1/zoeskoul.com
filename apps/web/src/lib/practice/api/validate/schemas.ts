import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                   basics                                   */
/* -------------------------------------------------------------------------- */

const Vec3Schema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
});

export const ProgrammingLanguageSchema = z.enum([
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
]);

export const SqlDialectSchema = z.enum([
    "sqlite",
    "postgres",
    "mysql",
    "mssql",
]);

/* -------------------------------------------------------------------------- */
/*                         code_input expected: programming                    */
/* -------------------------------------------------------------------------- */

const ProgrammingCodeTestSchema = z.object({
    stdin: z.string().optional().default(""),
    stdout: z.string().optional().default(""),
    match: z.enum(["exact", "includes"]).optional().default("exact"),
});

/**
 * Programming code_input expected schema
 *
 * Accepts:
 * - canonical: { tests: [...] }
 * - legacy: { stdin, stdout, match }
 *
 * Transforms both into:
 * {
 *   kind: "code_input",
 *   strategy: "programming",
 *   language,
 *   tests,
 *   solutionCode
 * }
 */
const ProgrammingExpectedSchema = z
    .object({
        kind: z.literal("code_input"),
        language: ProgrammingLanguageSchema.optional(),

        tests: z.array(ProgrammingCodeTestSchema).optional(),

        // legacy support:
        stdin: z.string().optional(),
        stdout: z.string().optional(),
        match: z.enum(["exact", "includes"]).optional(),

        solutionCode: z.string().optional(),
    })
    .transform((v) => {
        const tests =
            Array.isArray(v.tests) && v.tests.length
                ? v.tests
                : [
                    {
                        stdin: typeof v.stdin === "string" ? v.stdin : "",
                        stdout: typeof v.stdout === "string" ? v.stdout : "",
                        match: v.match ?? "exact",
                    },
                ];

        return {
            kind: "code_input" as const,
            strategy: "programming" as const,
            language: v.language,
            tests,
            solutionCode: v.solutionCode,
        };
    })
    .superRefine((v, ctx) => {
        if (!Array.isArray(v.tests) || v.tests.length < 1) {
            ctx.addIssue({
                code: "custom",
                path: ["tests"],
                message: "programming code_input expected must include tests[]",
            });
            return;
        }

        for (let i = 0; i < v.tests.length; i++) {
            const t = v.tests[i];
            if (typeof t.stdout !== "string") {
                ctx.addIssue({
                    code: "custom",
                    path: ["tests", i, "stdout"],
                    message: "Missing stdout for programming test case.",
                });
            }
        }
    });

/* -------------------------------------------------------------------------- */
/*                             code_input expected: sql                       */
/* -------------------------------------------------------------------------- */

const SqlCellSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);

const SqlExpectedTableSchema = z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(SqlCellSchema)),
});

const SqlRuntimeSchema = z.object({
    kind: z.literal("sql"),
    datasetId: z.string().min(1).optional(),
    resultShape: z.literal("table").optional(),
});

const SqlTestSchema = z
    .object({
        kind: z.literal("sql").default("sql"),
        sqlDialect: SqlDialectSchema.optional(),
        runtime: SqlRuntimeSchema.optional(),
        compareTo: z.enum(["solution", "expected_table"]).optional().default("solution"),
        expectedTable: SqlExpectedTableSchema.optional(),
        match: z.literal("table_exact").optional().default("table_exact"),
        ignoreRowOrder: z.boolean().optional().default(false),
    })
    .superRefine((v, ctx) => {
        if ((v.compareTo ?? "solution") === "expected_table" && !v.expectedTable) {
            ctx.addIssue({
                code: "custom",
                path: ["expectedTable"],
                message: "expectedTable is required when compareTo is 'expected_table'.",
            });
        }
    });

/**
 * SQL code_input expected schema
 *
 * Canonical shape:
 * {
 *   kind: "code_input",
 *   language: "sql",
 *   fixedSqlDialect?: "sqlite" | "postgres" | "mysql" | "mssql",
 *   runtime?: { kind: "sql", datasetId?: string, resultShape?: "table" },
 *   tests: [...],
 *   solutionCode?: string
 * }
 *
 * Transforms into:
 * {
 *   ...,
 *   strategy: "sql"
 * }
 */
const SqlExpectedSchema = z
    .object({
        kind: z.literal("code_input"),
        language: z.literal("sql"),
        fixedSqlDialect: SqlDialectSchema.optional(),
        runtime: SqlRuntimeSchema.optional(),
        tests: z.array(SqlTestSchema).min(1),
        solutionCode: z.string().optional(),
    })
    .transform((v) => ({
        ...v,
        strategy: "sql" as const,
    }))
    .superRefine((v, ctx) => {
        const needsSolution = v.tests.some(
            (t) => (t.compareTo ?? "solution") === "solution",
        );

        if (needsSolution && !String(v.solutionCode ?? "").trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["solutionCode"],
                message: "solutionCode is required when SQL tests compare to the solution.",
            });
        }
    });

/**
 * Unified code_input expected schema
 *
 * Parsed result has:
 * - strategy: "programming" | "sql"
 */
export const CodeExpectedSchema = z.union([
    ProgrammingExpectedSchema,
    SqlExpectedSchema,
]);

export type CodeExpected = z.infer<typeof CodeExpectedSchema>;
export type ProgrammingExpected = Extract<CodeExpected, { strategy: "programming" }>;
export type SqlExpected = Extract<CodeExpected, { strategy: "sql" }>;
export type SqlRuntime = z.infer<typeof SqlRuntimeSchema>;
export type SqlTest = z.infer<typeof SqlTestSchema>;
export type CodeExpectedInput = z.input<typeof CodeExpectedSchema>;

/* -------------------------------------------------------------------------- */
/*                                   keys                                     */
/* -------------------------------------------------------------------------- */

// accept key as string OR wrapped object (token/key/value)
const KeySchema = z.union([
    z.string().min(10),
    z.object({ token: z.string().min(10) }).passthrough(),
    z.object({ key: z.string().min(10) }).passthrough(),
    z.object({ value: z.string().min(10) }).passthrough(),
]);

/* -------------------------------------------------------------------------- */
/*                               answer schemas                               */
/* -------------------------------------------------------------------------- */

const TextInputAnswerSchema = z.object({
    kind: z.literal("text_input"),
    value: z.string().min(1),
});

const WordBankArrangeAnswerSchema = z.object({
    kind: z.literal("word_bank_arrange"),
    value: z.string().min(1),
});

const ListenBuildAnswerSchema = z.object({
    kind: z.literal("listen_build"),
    value: z.string().min(1),
});

const FillBlankChoiceAnswerSchema = z.object({
    kind: z.literal("fill_blank_choice"),
    value: z.string().min(1),
});

const DragReorderAnswerSchema = z.object({
    kind: z.literal("drag_reorder"),
    order: z.array(z.string().min(1)).min(1),
});

const VoiceInputAnswerSchema = z.object({
    kind: z.literal("voice_input"),
    transcript: z.string().min(1),
    audioId: z.string().optional(),
});

const CodeInputAnswerSchema = z
    .object({
        kind: z.literal("code_input"),
        language: z
            .enum(["python", "java", "javascript", "c", "cpp", "sql"])
            .optional(),
        code: z.string().optional(),
        source: z.string().optional(),
        stdin: z.string().optional(), // optional UI field; programming grader uses tests' stdin, SQL ignores it
    })
    .superRefine((v, ctx) => {
        const code = (v.code ?? v.source ?? "").trim();
        if (!code) {
            ctx.addIssue({
                code: "custom",
                path: ["code"],
                message: "Missing code.",
            });
        }
    });

const SubmitAnswerSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("single_choice"), optionId: z.string().min(1) }),

    z.object({
        kind: z.literal("multi_choice"),
        optionIds: z.array(z.string().min(1)).min(1),
    }),

    z.object({ kind: z.literal("numeric"), value: z.number() }),

    z.object({
        kind: z.literal("vector_drag_target"),
        a: Vec3Schema,
        b: Vec3Schema.optional(),
    }),

    z.object({
        kind: z.literal("vector_drag_dot"),
        a: Vec3Schema,
    }),

    z.object({
        kind: z.literal("matrix_input"),
        values: z.array(z.array(z.number())),
    }),

    CodeInputAnswerSchema,

    TextInputAnswerSchema,
    DragReorderAnswerSchema,
    VoiceInputAnswerSchema,
    WordBankArrangeAnswerSchema,
    ListenBuildAnswerSchema,
    FillBlankChoiceAnswerSchema,
]);

export const BodySchema = z
    .object({
        key: KeySchema,
        reveal: z.boolean().optional(),
        answer: SubmitAnswerSchema.optional(),
    })
    .superRefine((val, ctx) => {
        if (!val.reveal && !val.answer) {
            ctx.addIssue({
                code: "custom",
                path: ["answer"],
                message: "Missing answer.",
            });
        }
    });

export type ValidateBody = z.infer<typeof BodySchema>;
export type SubmitAnswer = z.infer<typeof SubmitAnswerSchema>;

/* -------------------------------------------------------------------------- */
/*                                 utilities                                  */
/* -------------------------------------------------------------------------- */

export function normalizeKey(input: unknown): string | null {
    if (typeof input === "string") return input;
    if (input && typeof input === "object") {
        const any = input as any;
        if (typeof any.token === "string") return any.token;
        if (typeof any.key === "string") return any.key;
        if (typeof any.value === "string") return any.value;
    }
    return null;
}