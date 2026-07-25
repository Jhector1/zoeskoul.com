import type { TutoringWorkspaceView } from "./contentRequestProtocol";

export const TUTORING_MASTER_OWNER_KEY = "shared";

export function tutoringReferenceOwnerKey(version: number) {
  return `reference:${Math.max(0, Math.trunc(version))}`;
}

export function readRequestedTutoringWorkspaceView(
  value: unknown,
): TutoringWorkspaceView {
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

export function canMutateTutoringWorkspace(
  access: ResolvedTutoringWorkspaceAccess | null | undefined,
) {
  return Boolean(access && !access.readOnly);
}

/**
 * Resolve one workspace identity for both progress and board storage.
 *
 * This module intentionally has no server-only, Prisma, or Next.js imports so
 * the authorization rules can be unit tested without loading persistence.
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
