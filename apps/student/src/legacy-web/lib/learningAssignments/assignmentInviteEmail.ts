import "server-only";

import {
  buildClassroomInviteMailto,
  sendClassroomInviteEmail,
  type ClassroomInviteEmailResult,
} from "@/lib/invitations/classroomInviteEmail";

export type LearningInviteEmailResult = ClassroomInviteEmailResult;

export async function sendLearningAssignmentInviteEmail(args: {
  to: string;
  inviteUrl: string;
  assignmentTitle: string;
  courseTitle: string;
  instructorName: string;
  expiresAt: Date;
}): Promise<LearningInviteEmailResult> {
  return sendClassroomInviteEmail({
    to: args.to,
    inviteUrl: args.inviteUrl,
    instructorName: args.instructorName,
    classroomTitle: args.assignmentTitle,
    courseTitle: args.courseTitle,
    expiresAt: args.expiresAt,
    classroomKind: "assigned course",
  });
}

export function buildLearningAssignmentInviteMailto(args: {
  to: string;
  inviteUrl: string;
  assignmentTitle: string;
  courseTitle: string;
  instructorName: string;
}) {
  return buildClassroomInviteMailto({
    to: args.to,
    inviteUrl: args.inviteUrl,
    instructorName: args.instructorName,
    classroomTitle: args.assignmentTitle,
    courseTitle: args.courseTitle,
    classroomKind: "assigned course",
  });
}
