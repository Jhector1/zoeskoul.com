import { z } from "zod";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";

function pickModuleSlug(...values: Array<string | undefined>) {
    for (const v of values) {
        const s = String(v ?? "").trim();
        if (s) return s;
    }
    return "";
}

export const ReviewProgressWriteSchema = z
    .object({
        subjectSlug: z.string().trim().min(1),
        moduleSlug: z.string().trim().optional(),
        moduleId: z.string().trim().optional(),   // backward compatibility
        moduleRef: z.string().trim().optional(),  // backward compatibility
        locale: z.string().trim().min(1).max(16).default("en"),
        state: z.custom<ReviewProgressState>(
            (value) => !!value && typeof value === "object" && !Array.isArray(value),
            "Missing/invalid state.",
        ),
    })
    .superRefine((val, ctx) => {
        if (!pickModuleSlug(val.moduleSlug, val.moduleId, val.moduleRef)) {
            ctx.addIssue({
                code: "custom",
                path: ["moduleSlug"],
                message: "Missing moduleSlug/moduleId/moduleRef.",
            });
        }
    })
    .transform((val) => ({
        ...val,
        moduleRef: pickModuleSlug(val.moduleSlug, val.moduleId, val.moduleRef),
    }));