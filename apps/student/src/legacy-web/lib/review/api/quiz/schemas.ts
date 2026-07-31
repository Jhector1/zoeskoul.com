import { z } from "zod";
import { PracticeKind } from "@zoeskoul/db";
import { pickModuleSlug } from "../shared/schemas";
function nullToUndefined(value: unknown) {
    return value === null ? undefined : value;
}

const MaxAttempts10Schema = z
    .number()
    .int()
    .min(1)
    .max(10)
    .nullable()
    .optional();

const MaxAttempts20Schema = z
    .number()
    .int()
    .min(1)
    .max(20)
    .nullable()
    .optional();
const StepSchema = z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().optional(),
    topic: z.string().trim().min(1).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    preferKind: z.nativeEnum(PracticeKind).nullable().optional(),
    exerciseKey: z.string().trim().optional(),
    seedPolicy: z.enum(["actor", "global"]).optional(),
    maxAttempts: z.number().int().min(1).max(20).nullable().optional(),
    carryFromPrev: z.boolean().optional(),
});

const ReviewQuizSpecBaseSchema = z.object({
    subject: z.string().trim().min(1),

    module: z.string().trim().optional(),
    moduleSlug: z.string().trim().optional(),

    section: z.string().trim().optional(),
    topic: z.string().trim().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    n: z.number().int().min(1).max(20).optional(),
    exerciseKeys: z.array(z.string().trim().min(1)).max(50).optional(),

    allowReveal: z.boolean().optional(),
    preferKind: z.nativeEnum(PracticeKind).nullable().optional(),
    maxAttempts: MaxAttempts10Schema,
    // accepted for backward compatibility, ignored by server
    quizKey: z.string().trim().optional(),

    mode: z.enum(["quiz", "project"]).optional(),
    steps: z.array(StepSchema).optional(),
});

export const ReviewQuizSpecSchema = ReviewQuizSpecBaseSchema
    .superRefine((val, ctx) => {
        if (!pickModuleSlug(val.moduleSlug, val.module)) {
            ctx.addIssue({
                code: "custom",
                path: ["moduleSlug"],
                message: "Missing module/moduleSlug.",
            });
        }

        const mode = val.mode ?? "quiz";

        if (mode === "project" && (!val.steps || val.steps.length === 0)) {
            ctx.addIssue({
                code: "custom",
                path: ["steps"],
                message: "steps[] is required when mode='project'.",
            });
        }

        if (mode === "project" && val.steps?.length) {
            val.steps.forEach((step, index) => {
                if (!step.topic && !val.topic) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["steps", index, "topic"],
                        message: "Project step requires topic, or the project spec must provide a parent topic.",
                    });
                }
            });
        }
    })
    .transform((val) => {
        const topic = val.topic?.trim();

        return {
            ...val,
            moduleSlug: pickModuleSlug(val.moduleSlug, val.module),
            steps: val.steps?.map((step) => ({
                ...step,
                topic: step.topic ?? topic,
            })),
        };
    });

export type ReviewQuizRequestSpec = z.output<typeof ReviewQuizSpecSchema>;
