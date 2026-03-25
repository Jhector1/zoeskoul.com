import { z } from "zod";

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
});

const CodeTestSchema = z.object({
  stdin: z.string().optional().default(""),
  stdout: z.string().optional().default(""),
  match: z.enum(["exact", "includes"]).optional().default("exact"),
});

/**
 * ✅ Expected schema used only inside the grader (code_input)
 * We accept:
 * - canonical: { tests: [...] }
 * - legacy: { stdin, stdout, match }
 * Then we coerce to tests[] in transform().
 */
export const CodeExpectedSchema = z
    .object({
      kind: z.literal("code_input"),
      language: z.enum(["python", "java", "javascript", "c", "cpp"]).optional(),

      tests: z.array(CodeTestSchema).optional(),

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
          message: "code_input expected must include tests[]",
        });
        return;
      }
      // Strong: every test must define stdout (empty string allowed, but field must exist)
      for (let i = 0; i < v.tests.length; i++) {
        const t = v.tests[i];
        if (typeof t.stdout !== "string") {
          ctx.addIssue({
            code: "custom",
            path: ["tests", i, "stdout"],
            message: "Missing stdout for test case.",
          });
        }
      }
    });

// accept key as string OR wrapped object (token/key/value)
const KeySchema = z.union([
  z.string().min(10),
  z.object({ token: z.string().min(10) }).passthrough(),
  z.object({ key: z.string().min(10) }).passthrough(),
  z.object({ value: z.string().min(10) }).passthrough(),
]);

// ✅ NEW answer kinds
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
  z.object({ kind: z.literal("vector_drag_dot"), a: Vec3Schema }),
  z.object({
    kind: z.literal("matrix_input"),
    values: z.array(z.array(z.number())),
  }),

  // code input: accept code or source (we validate on tests, not code equality)
  z
      .object({
        kind: z.literal("code_input"),
        language: z.enum(["python", "java", "javascript", "c", "cpp"]).optional(),
        code: z.string().optional(),
        source: z.string().optional(),
        stdin: z.string().optional(), // optional UI field; grader uses test stdin, not this
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
      }),

  TextInputAnswerSchema,
  DragReorderAnswerSchema,
  VoiceInputAnswerSchema,  // ✅ ADD
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

