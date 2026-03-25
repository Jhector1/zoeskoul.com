import { z } from "zod";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import { pickModuleSlug } from "../shared/schemas";

export const ReviewProgressWriteSchema = z
    .object({
        subjectSlug: z.string().trim().min(1),
        moduleSlug: z.string().trim().optional(),
        moduleId: z.string().trim().optional(), // backward compatibility
        locale: z.string().trim().min(1).max(16).default("en"),
        state: z.custom<ReviewProgressState>(
            (value) => !!value && typeof value === "object" && !Array.isArray(value),
            "Missing/invalid state.",
        ),
    })
    .superRefine((val, ctx) => {
        if (!pickModuleSlug(val.moduleSlug, val.moduleId)) {
            ctx.addIssue({
                code: "custom",
                path: ["moduleSlug"],
                message: "Missing moduleSlug/moduleId.",
            });
        }
    })
    .transform((val) => ({
        ...val,
        moduleRef: pickModuleSlug(val.moduleSlug, val.moduleId),
    }));

export type ReviewProgressWriteInput = z.output<typeof ReviewProgressWriteSchema>;