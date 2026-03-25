
import { z } from "zod";

const fileEntrySchema = z.object({
    path: z.string().min(1),
    content: z.string(),
});

export const interactiveRunReqSchema = z.union([
    z.object({
        kind: z.literal("code"),
        mode: z.literal("interactive"),
        language: z.enum(["python", "javascript", "c", "cpp", "java"]),
        code: z.string(),
        wallTimeoutMs: z.number().int().positive().max(60_000).optional(),
        idleTimeoutMs: z.number().int().positive().max(60_000).optional(),
    }),
    z.object({
        kind: z.literal("code"),
        mode: z.literal("interactive"),
        language: z.enum(["python", "javascript", "c", "cpp", "java"]),
        entry: z.string().min(1),
        files: z.union([
            z.array(fileEntrySchema),
            z.record(z.string(), z.string()),
        ]),
        wallTimeoutMs: z.number().int().positive().max(60_000).optional(),
        idleTimeoutMs: z.number().int().positive().max(60_000).optional(),
    }),
]);