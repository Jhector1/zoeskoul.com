import type { SessionRecord } from "./sessionStore.js";
import { sessionLearningLabMode, type LearningLabMode } from "../execution/learningLabMode.js";

export function resolveOwnedShellSession(args: {
  sessions: SessionRecord[];
  clientHostKey?: string;
  clientOwnerKey: string;
  clientWorkspaceKey?: string;
  workspaceKey?: string;
  forceNew?: boolean;
  labMode?: LearningLabMode;
}) {
  const owned = args.sessions.filter(
    (session) =>
      (session.kind === "shell" || session.kind == null) &&
      session.clientOwnerKey === args.clientOwnerKey,
  );

  const reusable = owned.find(
    (session) =>
      session.clientHostKey === (args.clientHostKey ?? null) &&
      session.clientWorkspaceKey === (args.clientWorkspaceKey ?? null) &&
      session.workspaceKey === (args.workspaceKey ?? null) &&
      sessionLearningLabMode(session.labMode) === (args.labMode ?? "standard"),
  );

  return {
    reusable: args.forceNew === true ? null : reusable ?? null,
    sessionsToCancel:
      args.forceNew === true || (owned.length > 0 && !reusable) ? owned : [],
  };
}
