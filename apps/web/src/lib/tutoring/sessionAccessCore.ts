export type TutoringParticipantRoleValue = "learner" | "observer" | null;

export function resolveTutoringAccess(args: {
  userId: string;
  ownerId: string;
  status: "draft" | "live" | "shared" | "archived";
  allowStudentEditing: boolean;
  directRole: TutoringParticipantRoleValue;
  isGroupParticipant: boolean;
  isAdmin: boolean;
}) {
  const isOwner = args.ownerId === args.userId;
  const canManage = isOwner || args.isAdmin;
  const participantRole =
    args.directRole ?? (args.isGroupParticipant ? ("learner" as const) : null);
  const participantCanView =
    participantRole !== null &&
    (args.status === "live" || args.status === "shared");

  if (!canManage && !participantCanView) return null;

  const isLearner = participantRole === "learner";
  return {
    participantRole,
    isOwner,
    isAdmin: args.isAdmin,
    canManage,
    canViewSolutions: canManage,
    canEditSharedDocuments:
      canManage || (isLearner && args.allowStudentEditing),
    canEditOwnProgress: canManage || isLearner,
  };
}
