import type { RequestHandler } from "express";
import { AdminLabFilesystemExpectedSchema } from "@zoeskoul/code-contracts";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { isEligibleAdminLabLesson, ADMIN_COURSE_SLUG } from "../services/execution/learningAdminLessonPolicy.js";
import { verifyAdminFilesystem, AdminFilesystemVerifierUnavailable } from "../services/execution/adminFilesystemEvidence.js";

/** Authenticated Web backend only: never evaluate learner-submitted evidence. */
export const verifyAdminFilesystemRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).sort().join(",") !== "expected,topicSlug" ||
        !isEligibleAdminLabLesson(ADMIN_COURSE_SLUG, body.topicSlug)) {
      return res.status(400).json({ok: false, error: "Invalid administrative verification request."});
    }
    const parsed = AdminLabFilesystemExpectedSchema.safeParse(body.expected);
    if (!parsed.success) {
      return res.status(400).json({ok: false, error: "Invalid administrative filesystem expectations."});
    }
    const result = await verifyAdminFilesystem({
      actorKey,
      topicSlug: body.topicSlug,
      expected: parsed.data,
    });
    return res.status(200).json({ok: true, ...result});
  } catch (error) {
    return res.status(error instanceof AdminFilesystemVerifierUnavailable ? 503 : 403)
      .json({ok: false, error: "Administrative filesystem verification is unavailable."});
  }
};
