import "server-only";

import {
  buildClassroomInviteMailto,
  sendClassroomInviteEmail,
  type ClassroomInviteEmailResult,
} from "@/lib/invitations/classroomInviteEmail";

export type LearningGroupInviteEmailResult = ClassroomInviteEmailResult;

export async function sendLearningGroupInviteEmail(args: {
  to: string;
  inviteUrl: string;
  className: string;
  instructorName: string;
  expiresAt: Date;
}): Promise<LearningGroupInviteEmailResult> {
  return sendClassroomInviteEmail({
    to: args.to,
    inviteUrl: args.inviteUrl,
    instructorName: args.instructorName,
    classroomTitle: args.className,
    courseTitle: args.className,
    expiresAt: args.expiresAt,
    classroomKind: "class membership",
  });
}

export function buildLearningGroupInviteMailto(args: {
  to: string;
  inviteUrl: string;
  className: string;
  instructorName: string;
}) {
  return buildClassroomInviteMailto({
    to: args.to,
    inviteUrl: args.inviteUrl,
    instructorName: args.instructorName,
    classroomTitle: args.className,
    courseTitle: args.className,
    classroomKind: "class membership",
  });
}
