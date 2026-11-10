import "server-only";
import { randomBytes } from "node:crypto";
import type { StudentAdminLabTarget } from "@/lib/learning/server/learningAdminStudentPolicy";
import { createStudentAdminGrantPayload } from "./learningAdminGrantPayload";

/** Never expose this grant or its secret in JSON, logs, React, or client code. */
export function mintStudentAdminLabGrant(args: {
  actorKey: string;
  target: StudentAdminLabTarget;
}): string {
  const secret = process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET ?? "";
  return createStudentAdminGrantPayload({
    ...args,
    secret,
    nowMs: Date.now(),
    nonce: randomBytes(16).toString("hex"),
  });
}
