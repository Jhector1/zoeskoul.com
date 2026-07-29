import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { redactReviewModuleSolutions } from "@/lib/learningAssignments/redactReviewModuleSolutions";
import type { ReviewModule } from "@/lib/subjects/types";
import { getResolvedReviewModule } from "@/lib/subjects/server/resolveSubjectPresentation";
import { getTutoringSessionAccess } from "./sessionAccess";
import { TUTORING_DOCUMENT_LIMITS } from "./sessionDocumentPolicy";
import { parseTutoringSnapshot } from "./sessionSnapshot";
import { loadTutoringParticipants } from "./sessionParticipants";
import { getTutoringWorkspaceMeta } from "./sessionWorkspace";
import { rebaseTutoringModuleToolPresentation } from "./sessionToolPresentation";

export async function loadTutoringSessionPage(args: {
  sessionId: string;
  moduleSlug?: string | null;
}) {
  const authSession = await auth();
  const userId = (authSession?.user as { id?: string } | undefined)?.id;
  if (!userId) return { status: "signed_out" as const };

  let access = await getTutoringSessionAccess(prisma, {
    sessionId: args.sessionId,
    userId,
    teachingUser: null,
  });
  if (!access) {
    const teachingUser = await getTeachingUser();
    if (teachingUser?.isAdmin) {
      access = await getTutoringSessionAccess(prisma, {
        sessionId: args.sessionId,
        userId,
        teachingUser,
      });
    }
  }
  if (!access) return { status: "forbidden" as const };

  if (
    access.tutoringSession.snapshotVersion !== 1 ||
    access.tutoringSession.snapshotBytes <= 0 ||
    access.tutoringSession.snapshotBytes > TUTORING_DOCUMENT_LIMITS.maxSnapshotBytes ||
    access.tutoringSession.moduleKeys.length === 0 ||
    access.tutoringSession.moduleKeys.length > TUTORING_DOCUMENT_LIMITS.maxSnapshotModules
  ) {
    return {
      status: "empty" as const,
      session: access.tutoringSession,
      snapshot: null,
    };
  }

  // The large frozen snapshot is fetched only after the narrow authorization query succeeds.
  const stored = await prisma.tutoringSession.findUnique({
    where: { id: args.sessionId },
    select: { snapshot: true },
  });
  const snapshot = parseTutoringSnapshot(stored?.snapshot);
  const snapshotModuleKeys = snapshot?.modules.map((item) => item.sessionModuleSlug);
  const metadataMatches =
    snapshotModuleKeys?.length === access.tutoringSession.moduleKeys.length &&
    snapshotModuleKeys.every((key) => access.tutoringSession.moduleKeys.includes(key));
  if (!snapshot || !metadataMatches) {
    return {
      status: "empty" as const,
      session: access.tutoringSession,
      snapshot: null,
    };
  }

  const selected =
    snapshot.modules.find((item) => item.sessionModuleSlug === args.moduleSlug) ??
    snapshot.modules[0] ??
    null;

  if (!selected) {
    return {
      status: "empty" as const,
      session: access.tutoringSession,
      snapshot,
    };
  }

  let currentSourceModule: ReviewModule | null = null;
  try {
    currentSourceModule = await getResolvedReviewModule(
      snapshot.subjectSlug,
      selected.sourceModuleSlug,
    );
  } catch {
    // Frozen tutoring content remains usable if the source course is removed
    // or temporarily cannot be resolved.
  }

  const moduleWithCurrentToolPresentation =
    rebaseTutoringModuleToolPresentation({
      frozenModule: selected.module,
      currentModule: currentSourceModule,
    });
  const resolvedModule = access.canViewSolutions
    ? moduleWithCurrentToolPresentation
    : redactReviewModuleSolutions(moduleWithCurrentToolPresentation);
  const [workspaceMeta, participants] = await Promise.all([
    getTutoringWorkspaceMeta(prisma, {
      sessionId: args.sessionId,
      moduleKeys: access.tutoringSession.moduleKeys,
    }),
    access.canViewParticipantWork
      ? loadTutoringParticipants(prisma, args.sessionId)
      : Promise.resolve([]),
  ]);

  return {
    status: "ready" as const,
    session: access.tutoringSession,
    snapshot,
    selected: {
      ...selected,
      module: resolvedModule as ReviewModule,
    },
    canEdit: access.canEditOwnProgress,
    canEditBoard: access.canEditSharedDocuments,
    canManage: access.canManage,
    canEditMasterWorkspace: access.canEditMasterWorkspace,
    participantRole: access.participantRole,
    publishedVersion: workspaceMeta.publishedVersion,
    publishedAt: workspaceMeta.publishedAt,
    participants,
    isTutor: access.canManage,
  };
}
