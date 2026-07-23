import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const emailList = z.array(z.string().trim().email()).max(500).default([]);

export const LearningGroupInputSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  memberEmails: emailList,
});

export const LearningAssignmentInputSchema = z
  .object({
    slug,
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    subjectId: z.string().min(1),
    status: z.enum(["draft", "assigned", "closed"]).default("draft"),
    availableFrom: z.string().datetime().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    solutionVisibility: z
      .enum(["instructor_only", "after_completion", "after_due_date", "always"])
      .default("instructor_only"),
    userEmails: emailList,
    groupIds: z.array(z.string().min(1)).max(200).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.availableFrom && value.dueAt) {
      if (new Date(value.availableFrom) >= new Date(value.dueAt)) {
        ctx.addIssue({
          code: "custom",
          path: ["dueAt"],
          message: "Due date must be after the availability date.",
        });
      }
    }
    if (value.status === "assigned" && value.userEmails.length === 0 && value.groupIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["userEmails"],
        message: "Assign at least one student or group before publishing.",
      });
    }
  });

export type LearningGroupInput = z.infer<typeof LearningGroupInputSchema>;
export type LearningAssignmentInput = z.infer<typeof LearningAssignmentInputSchema>;
