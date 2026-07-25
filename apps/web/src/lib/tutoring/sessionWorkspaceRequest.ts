import "server-only";

import { prisma } from "@/lib/prisma";
import {
  TUTORING_LEARNER_ID_HEADER,
  TUTORING_WORKSPACE_VIEW_HEADER,
} from "./contentRequestProtocol";
import {
  getTutoringWorkspaceMeta,
  isTutoringParticipant,
  readRequestedTutoringWorkspaceView,
  resolveTutoringWorkspaceAccess,
} from "./sessionWorkspace";

export async function resolveTutoringRequestWorkspace(args: {
  request: Request;
  access: any;
  payload?: Record<string, unknown> | null;
}) {
  const url = new URL(args.request.url);
  const requestedView = readRequestedTutoringWorkspaceView(
    args.payload?.workspaceView ??
      url.searchParams.get("workspaceView") ??
      args.request.headers.get(TUTORING_WORKSPACE_VIEW_HEADER),
  );
  const requestedLearnerId = String(
    args.payload?.learnerId ??
      url.searchParams.get("learnerId") ??
      args.request.headers.get(TUTORING_LEARNER_ID_HEADER) ??
      "",
  ).trim();
  const meta = await getTutoringWorkspaceMeta(prisma, {
    sessionId: args.access.tutoringSession.id,
    moduleKeys: args.access.tutoringSession.moduleKeys,
  });
  const learnerIsParticipant =
    requestedView === "learner" && requestedLearnerId
      ? await isTutoringParticipant(prisma, {
          sessionId: args.access.tutoringSession.id,
          userId: requestedLearnerId,
        })
      : false;

  const resolved = resolveTutoringWorkspaceAccess({
    requestedView,
    requestedLearnerId,
    currentUserId: args.access.userId,
    canManage: args.access.canManage,
    canEditOwnProgress: args.access.canEditOwnProgress,
    status: args.access.tutoringSession.status,
    publishedVersion: meta.publishedVersion,
    learnerIsParticipant,
  });

  return { resolved, meta };
}
