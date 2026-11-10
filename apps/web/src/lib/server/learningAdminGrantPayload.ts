import { createHmac } from "node:crypto";
import {
  STUDENT_ADMIN_COURSE_SLUG,
  type StudentAdminLabTarget,
} from "@/lib/learning/server/learningAdminStudentPolicy";

/** Same signed v1 grant contract the existing Runner verifies. */
export function createStudentAdminGrantPayload(args: {
  actorKey: string;
  target: StudentAdminLabTarget;
  secret: string;
  nonce: string;
  nowMs: number;
}): string {
  // Only authenticated user actor keys are eligible. No dev/e2e/guest actors.
  if (!/^u:[0-9a-f]{64}$/.test(args.actorKey) ||
      Buffer.byteLength(args.secret, "utf8") < 32 ||
      !/^[0-9a-f]{32}$/.test(args.nonce) ||
      !Number.isSafeInteger(args.nowMs) || args.nowMs < 0) {
    throw new Error("Administrative lab grant configuration is invalid.");
  }
  const now = Math.floor(args.nowMs / 1000);
  const claims = {
    v: 1,
    aud: "zoeskoul-learning-admin",
    actorKey: args.actorKey,
    courseSlug: STUDENT_ADMIN_COURSE_SLUG,
    topicSlug: args.target.topicSlug,
    iat: now,
    exp: now + 30,
    nonce: args.nonce,
  };
  const encoded = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", args.secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
