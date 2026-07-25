import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { TUTORING_DOCUMENT_LIMITS, utf8Bytes } from "./sessionDocumentPolicy";

export const TUTORING_MASTER_OWNER_KEY = "shared";
export const TUTORING_META_OWNER_KEY = "system";
export const TUTORING_META_CARD_KEY = "session-meta";
export const TUTORING_META_TOOL_ID = "tutoring-meta";
export const TUTORING_PROGRESS_CARD_KEY = "review-progress";
export const TUTORING_PROGRESS_TOOL_ID = "progress";
export const TUTORING_BOARD_TOOL_ID = "board";

export type TutoringWorkspaceView = "master" | "reference" | "mine" | "learner";

export type TutoringWorkspaceMeta = {
  version: 1;
  publishedVersion: number;
  publishedAt: string | null;
};

export function emptyTutoringWorkspaceMeta(): TutoringWorkspaceMeta {
  return {
    version: 1,
    publishedVersion: 0,
    publishedAt: null,
  };
}

export function tutoringReferenceOwnerKey(version: number) {
  return `reference:${Math.max(0, Math.trunc(version))}`;
}

export function parseTutoringWorkspaceMeta(body: string | null | undefined) {
  if (!body) return emptyTutoringWorkspaceMeta();
  try {
    const value = JSON.parse(body) as Partial<TutoringWorkspaceMeta>;
    if (
      value?.version !== 1 ||
      !Number.isInteger(value.publishedVersion) ||
      Number(value.publishedVersion) < 0
    ) {
      return emptyTutoringWorkspaceMeta();
    }
    return {
      version: 1 as const,
      publishedVersion: Number(value.publishedVersion),
      publishedAt:
        typeof value.publishedAt === "string" && value.publishedAt
          ? value.publishedAt
          : null,
    };
  } catch {
    return emptyTutoringWorkspaceMeta();
  }
}

export async function getTutoringWorkspaceMeta(
  prisma: Pick<PrismaClient, "tutoringSessionDocument">,
  args: { sessionId: string; moduleKeys: readonly string[] },
) {
  const moduleKey = args.moduleKeys[0];
  if (!moduleKey) return emptyTutoringWorkspaceMeta();

  const document = await prisma.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: {
        sessionId: args.sessionId,
        ownerKey: TUTORING_META_OWNER_KEY,
        moduleKey,
        cardKey: TUTORING_META_CARD_KEY,
        toolId: TUTORING_META_TOOL_ID,
      },
    },
    select: { body: true },
  });
  return parseTutoringWorkspaceMeta(document?.body);
}

export function readRequestedTutoringWorkspaceView(value: unknown): TutoringWorkspaceView {
  return value === "master" ||
    value === "reference" ||
    value === "mine" ||
    value === "learner"
    ? value
    : "mine";
}

export type TutoringWorkspaceAccessInput = {
  requestedView: TutoringWorkspaceView;
  requestedLearnerId?: string | null;
  currentUserId: string;
  canManage: boolean;
  canEditOwnProgress: boolean;
  status: "draft" | "live" | "shared" | "archived";
  publishedVersion: number;
  learnerIsParticipant?: boolean;
};

export type ResolvedTutoringWorkspaceAccess = {
  view: TutoringWorkspaceView;
  ownerKey: string;
  sourceOwnerKey: string | null;
  readOnly: boolean;
  baselineVersion: number;
  learnerId: string | null;
};

/**
 * Resolve one workspace identity for both progress and board storage.
 *
 * - master: tutor-authored mutable live/draft workspace
 * - reference: latest immutable published snapshot
 * - mine: participant-owned editable copy
 * - learner: tutor's read-only view of a selected participant copy
 */
export function resolveTutoringWorkspaceAccess(
  args: TutoringWorkspaceAccessInput,
): ResolvedTutoringWorkspaceAccess | null {
  const publishedOwner =
    args.publishedVersion > 0
      ? tutoringReferenceOwnerKey(args.publishedVersion)
      : TUTORING_MASTER_OWNER_KEY;

  if (args.requestedView === "master") {
    if (!args.canManage && args.status !== "live") return null;
    return {
      view: "master",
      ownerKey: TUTORING_MASTER_OWNER_KEY,
      sourceOwnerKey: args.canManage ? `user:${args.currentUserId}` : null,
      readOnly: !args.canManage || args.status === "archived",
      baselineVersion: 0,
      learnerId: null,
    };
  }

  if (args.requestedView === "reference") {
    return {
      view: "reference",
      ownerKey: publishedOwner,
      sourceOwnerKey: null,
      readOnly: true,
      baselineVersion: args.publishedVersion,
      learnerId: null,
    };
  }

  if (args.requestedView === "learner") {
    const learnerId = String(args.requestedLearnerId ?? "").trim();
    if (!args.canManage || !learnerId || !args.learnerIsParticipant) return null;
    return {
      view: "learner",
      ownerKey: `user:${learnerId}`,
      sourceOwnerKey: publishedOwner,
      readOnly: true,
      baselineVersion: args.publishedVersion,
      learnerId,
    };
  }

  if (!args.canEditOwnProgress) return null;
  return {
    view: "mine",
    ownerKey: `user:${args.currentUserId}`,
    sourceOwnerKey: publishedOwner,
    readOnly: args.status === "archived",
    baselineVersion: args.publishedVersion,
    learnerId: args.currentUserId,
  };
}

export async function isTutoringParticipant(
  prisma: PrismaClient,
  args: { sessionId: string; userId: string },
) {
  const row = await prisma.tutoringSession.findFirst({
    where: {
      id: args.sessionId,
      OR: [
        { users: { some: { userId: args.userId } } },
        { groups: { some: { group: { members: { some: { userId: args.userId } } } } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function publishTutoringWorkspaceSnapshot(
  tx: any,
  args: {
    sessionId: string;
    moduleKeys: readonly string[];
    publishedByUserId: string;
  },
) {
  const moduleKey = args.moduleKeys[0];
  if (!moduleKey) {
    return emptyTutoringWorkspaceMeta();
  }

  const existingMeta = await tx.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: {
        sessionId: args.sessionId,
        ownerKey: TUTORING_META_OWNER_KEY,
        moduleKey,
        cardKey: TUTORING_META_CARD_KEY,
        toolId: TUTORING_META_TOOL_ID,
      },
    },
    select: { body: true },
  });
  const previousMeta = parseTutoringWorkspaceMeta(existingMeta?.body);
  if (
    previousMeta.publishedVersion >=
    TUTORING_DOCUMENT_LIMITS.maxPublishedWorkspaceVersions
  ) {
    throw new Error("TUTORING_PUBLISHED_VERSION_LIMIT");
  }
  const nextVersion = previousMeta.publishedVersion + 1;
  const targetOwnerKey = tutoringReferenceOwnerKey(nextVersion);
  const publishedAt = new Date().toISOString();

  const masterDocuments = await tx.tutoringSessionDocument.findMany({
    where: {
      sessionId: args.sessionId,
      ownerKey: TUTORING_MASTER_OWNER_KEY,
      toolId: { in: [TUTORING_PROGRESS_TOOL_ID, TUTORING_BOARD_TOOL_ID] },
    },
    select: {
      moduleKey: true,
      cardKey: true,
      toolId: true,
      format: true,
      body: true,
      byteSize: true,
    },
  });
  const legacyTutorProgress = await tx.tutoringSessionDocument.findMany({
    where: {
      sessionId: args.sessionId,
      ownerKey: `user:${args.publishedByUserId}`,
      toolId: TUTORING_PROGRESS_TOOL_ID,
    },
    select: {
      moduleKey: true,
      cardKey: true,
      toolId: true,
      format: true,
      body: true,
      byteSize: true,
    },
  });
  const masterKeys = new Set(
    masterDocuments.map(
      (document: any) => `${document.moduleKey}${document.cardKey}${document.toolId}`,
    ),
  );
  const snapshotDocuments = [
    ...masterDocuments,
    ...legacyTutorProgress.filter(
      (document: any) =>
        !masterKeys.has(`${document.moduleKey}${document.cardKey}${document.toolId}`),
    ),
  ];

  const publishedUsage = await tx.tutoringSessionDocument.aggregate({
    where: {
      sessionId: args.sessionId,
      ownerKey: { startsWith: "reference:" },
      toolId: { in: [TUTORING_PROGRESS_TOOL_ID, TUTORING_BOARD_TOOL_ID] },
    },
    _sum: { byteSize: true },
  });
  const nextSnapshotBytes = snapshotDocuments.reduce(
    (total: number, document: any) => total + Number(document.byteSize ?? 0),
    0,
  );
  if (
    (publishedUsage._sum.byteSize ?? 0) + nextSnapshotBytes >
    TUTORING_DOCUMENT_LIMITS.maxPublishedWorkspaceBytes
  ) {
    throw new Error("TUTORING_PUBLISHED_STORAGE_LIMIT");
  }


  if (snapshotDocuments.length) {
    await tx.tutoringSessionDocument.createMany({
      data: snapshotDocuments.map((document: any) => ({
        sessionId: args.sessionId,
        ownerKey: targetOwnerKey,
        moduleKey: document.moduleKey,
        cardKey: document.cardKey,
        toolId: document.toolId,
        format: document.format,
        body: document.body,
        byteSize: document.byteSize,
        updatedByUserId: args.publishedByUserId,
      })),
      skipDuplicates: true,
    });
  }

  const nextMeta: TutoringWorkspaceMeta = {
    version: 1,
    publishedVersion: nextVersion,
    publishedAt,
  };
  const serialized = JSON.stringify(nextMeta);
  await tx.tutoringSessionDocument.upsert({
    where: {
      tutoring_session_document: {
        sessionId: args.sessionId,
        ownerKey: TUTORING_META_OWNER_KEY,
        moduleKey,
        cardKey: TUTORING_META_CARD_KEY,
        toolId: TUTORING_META_TOOL_ID,
      },
    },
    create: {
      sessionId: args.sessionId,
      ownerKey: TUTORING_META_OWNER_KEY,
      moduleKey,
      cardKey: TUTORING_META_CARD_KEY,
      toolId: TUTORING_META_TOOL_ID,
      format: "plain",
      body: serialized,
      byteSize: utf8Bytes(serialized),
      updatedByUserId: args.publishedByUserId,
    },
    update: {
      body: serialized,
      byteSize: utf8Bytes(serialized),
      revision: { increment: 1 },
      updatedByUserId: args.publishedByUserId,
    },
  });

  return nextMeta;
}
