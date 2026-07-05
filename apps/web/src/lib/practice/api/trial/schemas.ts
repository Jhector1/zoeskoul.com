import { z } from "zod";

export const TrialStartBodySchema = z
  .object({
    subject: z.string().trim().min(1).optional(),
    level: z.string().trim().optional(),
    locale: z.string().trim().min(2).max(16).optional().default("en"),
    challenge: z.string().trim().min(20).max(8_192).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.subject && !value.challenge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "subject or challenge is required.",
      });
    }
  });

export type TrialStartBody = z.infer<typeof TrialStartBodySchema>;
