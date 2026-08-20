// src/lib/practice/api/practiceGet/schemas.ts
import { z } from "zod";

export const GetParamsSchema = z.object({
  subject: z.string().optional(),
  module: z.string().optional(),
  topic: z.string().optional(), // "py0.io_vars" or "" or "all"
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  section: z.string().optional(),
// add this to your GetParams zod schema
includeMissed: z.enum(["true", "false"]).optional(),
  includeHistory: z.string().optional(),  // ✅ ADD THIS
  allowReveal: z.enum(["true", "false"]).optional(),
  sessionId: z.string().optional(),
  practiceRunId: z.string().min(1).optional(),
  practiceRunStartedAt: z.string().datetime().optional(),
  questionCount: z.coerce.number().int().positive().max(100).optional(),
  statusOnly: z.enum(["true", "false"]).optional(),
  // Exact signed-key refresh only. Normal exercise loading must never inherit
  // the stricter "same open instance" failure semantics.
  keyRefreshOnly: z.enum(["true", "false"]).optional(),
  // Exact PracticeQuestionInstance encoded by the signed key being refreshed.
  keyRefreshInstanceId: z.string().min(1).optional(),
    // ✅ add this
    // preferPurpose: z.enum(["quiz", "project"]).optional(),
  // ✅ NEW: persisted on PracticeSession so completion redirect survives refresh
  returnUrl: z.string().optional(),
  returnTo: z.string().optional(), // alias (optional)
    // back: z.string().optional(), // alias (optional)

    // ✅ NEW: quiz | project | practice | mixed
    preferPurpose: z.enum(["quiz", "project", "practice", "mixed"]).optional(),

    // ✅ NEW: strict = error if not allowed, fallback = auto-pick allowed
    purposePolicy: z.enum(["strict", "fallback"]).optional(),
    preferKind: z
        .enum([
            "numeric",
            "single_choice",
            "multi_choice",
            "vector_drag_target",
            "vector_drag_dot",
            "matrix_input",
            "code_input",
            "text_input",
            "drag_reorder",
            "voice_input",
            "word_bank_arrange",
            "listen_build",
            "fill_blank_choice",
        ])
        .optional(),


  salt: z.string().optional(),
    exerciseKey: z.string().optional(),
    seedPolicy: z.enum(["actor", "global"]).optional(),

});

export type GetParams = z.infer<typeof GetParamsSchema>;







