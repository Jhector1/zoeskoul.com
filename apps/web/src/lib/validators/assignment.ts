import { z } from "zod";

export const PRACTICE_TOPICS = ["dot", "projection", "angle", "vectors", "vectors_part1", "vectors_part2"] as const;
export const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const ASSIGNMENT_STATUSES = ["draft", "published", "archived"] as const;

const zNullableDate = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}, z.date().nullable());

const zNullableInt = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}, z.number().int().nullable());

const zBool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return Boolean(v);
}, z.boolean());

export const AssignmentCreateSchema = z.object({
  slug: z.string().min(2).max(120),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).nullable().optional(),

  sectionId: z.string().min(1),
  topicIds: z.array(z.string()).optional(),


topics: z.array(z.object({ topicId: z.string(), order: z.number().optional() })).optional(),
  difficulty: z.enum(PRACTICE_DIFFICULTIES),
  questionCount: z.number().int().min(1).max(100).default(10),

  availableFrom: zNullableDate.optional(),
  dueAt: zNullableDate.optional(),
  timeLimitSec: zNullableInt.optional(),

  maxAttempts: zNullableInt.optional(),
  allowReveal: zBool.default(false),
  showDebug: zBool.default(false),
});

export const AssignmentPatchSchema = AssignmentCreateSchema.partial().extend({
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
});

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateSchema>;
export type AssignmentPatchInput = z.infer<typeof AssignmentPatchSchema>;
