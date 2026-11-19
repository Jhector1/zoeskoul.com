import type { SessionRecord } from "../sessions/sessionStore.js";
import { FULL_PRIVILEGES_TOPIC_SLUG } from "./learningAdminLessonPolicy.js";

/** Transport activity is not user activity for the disposable global lab. */
export function isGlobalAdminShell(session: Pick<SessionRecord, "labMode" | "adminTopicSlug" | "kind">): boolean {
  return session.labMode === "admin" && session.adminTopicSlug === FULL_PRIVILEGES_TOPIC_SLUG && session.kind === "shell";
}

/** Pure, non-mutating authorization. Never changes activity or deadlines. */
export function mayAttachGlobalAdminShell(
  session: SessionRecord | null, actorKey: string, gateEnabled: boolean, now: number,
): boolean {
  if (!session || !isGlobalAdminShell(session) || !gateEnabled ||
      !/^u:[0-9a-f]{64}$/.test(actorKey) || session.ownerKey !== actorKey ||
      (session.state !== "waiting_for_input" && session.state !== "running") ||
      session.finalizedAt != null || !session.attachStream || !session.containerId) return false;
  const { createdAt, lastActivityAt, idleTimeoutMs, hardLifetimeMs } = session;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(lastActivityAt) ||
      typeof idleTimeoutMs !== "number" || typeof hardLifetimeMs !== "number" ||
      !Number.isSafeInteger(idleTimeoutMs) || !Number.isSafeInteger(hardLifetimeMs) ||
      idleTimeoutMs <= 0 || hardLifetimeMs <= 0 || createdAt > lastActivityAt || lastActivityAt > now) return false;
  return now - createdAt < hardLifetimeMs && now - lastActivityAt < idleTimeoutMs;
}
