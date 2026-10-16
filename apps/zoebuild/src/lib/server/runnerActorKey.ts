import "server-only";

import {
  createHash,
} from "node:crypto";

function sha(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

/**
 * Derive the trusted runner actor key from the canonical ZoeBuild user id.
 *
 * Authentication is Web-owned and has already been resolved by the calling
 * Build route before this helper runs. This helper must never open a second
 * Auth.js/session boundary.
 */
export async function requireRunnerActorKey(
  userId: string,
): Promise<string> {
  const normalizedUserId =
    userId.trim();

  if (!normalizedUserId) {
    throw new Error("Unauthorized");
  }

  return `u:${sha(normalizedUserId)}`;
}
