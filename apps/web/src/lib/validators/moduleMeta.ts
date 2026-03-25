import { z } from "zod";

export const ModuleMetaSchema = z.object({
    outcomes: z.array(z.string().min(1)).optional(),
    why: z.array(z.string().min(1)).optional(),
    prereqs: z.array(z.string().min(1)).optional(),
    videoUrl: z.string().url().nullable().optional(),
    estimatedMinutes: z.number().int().positive().optional(),
});

export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;

export function parseModuleMeta(meta: unknown): ModuleMeta {
    const parsed = ModuleMetaSchema.safeParse(meta);
    return parsed.success ? parsed.data : {};
}
