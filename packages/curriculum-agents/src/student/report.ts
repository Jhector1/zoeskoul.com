import {
  z,
} from "zod";

export const StudentFindingSeveritySchema = z.enum([
  "critical",
  "major",
  "minor",
  "suggestion",
]);

export const StudentFindingCategorySchema = z.enum([
  "unclear_instruction",
  "missing_prerequisite",
  "difficulty_jump",
  "broken_flow",
  "unexpected_feedback",
  "repetition",
  "accessibility",
  "motivation",
  "other",
]);

export const StudentFindingSchema = z.object({
  severity:
    StudentFindingSeveritySchema,
  category:
    StudentFindingCategorySchema,
  url: z.string(),
  lessonOrExercise:
    z.string().nullable(),
  problem: z.string(),
  evidence: z.string(),
  learnerImpact: z.string(),
  attemptedAction:
    z.string().nullable(),
});

export const BrowserEvidenceSchema = z.object({
  clickCount:
    z.number().int().nonnegative(),
  checkAnswerClicks:
    z.number().int().nonnegative(),
  runClicks:
    z.number().int().nonnegative(),
  revealClicks:
    z.number().int().nonnegative(),
  practiceNextClicks:
    z.number().int().nonnegative(),
  finishClicks:
    z.number().int().nonnegative(),
  modulesClicks:
    z.number().int().nonnegative(),
  events: z.array(
    z.object({
      sequence:
        z.number().int().positive(),
      at: z.string(),
      kind: z.string(),
      action: z.string(),
      urlBefore: z.string(),
      urlAfter: z.string(),
      detail:
        z.string().nullable(),
    }),
  ),
});

export const StudentRunReportSchema = z.object({
  status: z.enum([
    "completed",
    "blocked",
    "partial",
  ]),
  startUrl: z.string(),
  endUrl: z.string(),
  pagesVisited:
    z.array(z.string()),
  exercisesAttempted:
    z.number().int().nonnegative(),
  quizzesAttempted:
    z.number().int().nonnegative(),
  projectStepsAttempted:
    z.number().int().nonnegative(),
  findings:
    z.array(StudentFindingSchema),
  strongestParts:
    z.array(z.string()),
  summary: z.string(),
  stoppedReason:
    z.string().nullable(),
  browserEvidence:
    BrowserEvidenceSchema.optional(),
});

export type StudentFinding =
  z.infer<
    typeof StudentFindingSchema
  >;

export type StudentRunReport =
  z.infer<
    typeof StudentRunReportSchema
  >;
