import { z } from "zod";

export const TrialStartBodySchema = z.object({
    subject: z.string().min(1),
    level: z.string().optional(),
    locale: z.string().optional().default("en"),
});

export type TrialStartBody = z.infer<typeof TrialStartBodySchema>;
