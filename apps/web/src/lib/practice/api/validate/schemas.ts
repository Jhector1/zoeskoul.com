import { z } from "zod";
import {
    CodeExpectedSchema as SharedCodeExpectedSchema,
    ProgrammingExpectedSchema as SharedProgrammingExpectedSchema,
    SqlExpectedSchema as SharedSqlExpectedSchema,
    SqlRuntimeSchema,
    SqlExpectedTestSchema as SqlTestSchema,
    type ProgrammingExpected,
    type SqlExpected,
    type SqlRuntimeSpec as SqlRuntime,
    type SqlExpectedTest as SqlTest,
    type ProgrammingExpectedInput,
    type SqlExpectedInput,
} from "@zoeskoul/practice-checks";

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

export const ProgrammingExpectedSchema = SharedProgrammingExpectedSchema;
export const SqlExpectedSchema = SharedSqlExpectedSchema;
export const CodeExpectedSchema = SharedCodeExpectedSchema;

export type CodeExpected = ProgrammingExpected | SqlExpected;
export type { ProgrammingExpected, SqlExpected, SqlRuntime, SqlTest };
export type CodeExpectedInput = ProgrammingExpectedInput | SqlExpectedInput;

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
