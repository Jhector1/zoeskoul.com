import { z } from "zod";

const TutoringStatusSchema = z.enum(["draft", "live", "shared", "archived"]);
const UserEmailsSchema = z.array(z.string().email());
const GroupIdsSchema = z.array(z.string().min(1));

export const TutoringSessionInputSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  subjectId: z.string().min(1),
  selectionScope: z.enum(["course", "module", "section", "topic"]),
  sourceModuleSlug: z.string().trim().nullable().optional(),
  sourceSectionSlug: z.string().trim().nullable().optional(),
  sourceTopicId: z.string().trim().nullable().optional(),
  status: TutoringStatusSchema.default("draft"),
  allowStudentEditing: z.boolean().default(true),
  userEmails: UserEmailsSchema.default([]),
  groupIds: GroupIdsSchema.default([]),
});

export const TutoringSessionUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    status: TutoringStatusSchema.optional(),
    allowStudentEditing: z.boolean().optional(),
    userEmails: UserEmailsSchema.optional(),
    groupIds: GroupIdsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one tutoring session field is required.",
  });

export function safeParseTutoringSessionUpdate(input: unknown) {
  return TutoringSessionUpdateSchema.safeParse(input);
}

export type TutoringSessionInput = z.infer<typeof TutoringSessionInputSchema>;
export type TutoringSessionUpdateInput = z.infer<typeof TutoringSessionUpdateSchema>;
