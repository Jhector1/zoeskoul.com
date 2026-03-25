import { z } from "zod";
import { PracticeKind } from "@prisma/client";
import { pickModuleSlug } from "../shared/schemas";

const StepSchema = z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().optional(),
    topic: z.string().trim().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    preferKind: z.nativeEnum(PracticeKind).nullable().optional(),
    exerciseKey: z.string().trim().optional(),
    seedPolicy: z.enum(["actor", "global"]).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
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

    allowReveal: z.boolean().optional(),
    preferKind: z.nativeEnum(PracticeKind).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),

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
    })
    .transform((val) => ({
        ...val,
        moduleSlug: pickModuleSlug(val.moduleSlug, val.module),
    }));

export type ReviewQuizRequestSpec = z.output<typeof ReviewQuizSpecSchema>;