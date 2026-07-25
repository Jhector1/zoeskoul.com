import "server-only";

import { prisma } from "@/lib/prisma";
import { getLearningAssignmentsForUser } from "@/lib/learningAssignments/assignmentAccessServer";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import { tutoringParticipantWhere } from "@/lib/tutoring/sessionAccess";
import {
  linkTutoringSessionInvitesToUser,
  tutoringSessionInviteState,
} from "@/lib/tutoring/sessionInvites";

export async function loadAssignedLearningForUser(args: {
  userId: string;
  locale: string;
}) {
  const rawAssignments = await getLearningAssignmentsForUser(prisma, {
    userId: args.userId,
  });
  const resolvedSubjects = await resolveSubjectDeliveryPresentations(
    rawAssignments.map((assignment) => assignment.subject),
    args.locale,
  );
  const assignments = rawAssignments.map((assignment, index) => ({
    ...assignment,
    subject: resolvedSubjects[index],
  }));

  const subjectIds = [...new Set(assignments.map((assignment) => assignment.subject.id))];
  const enrollments = subjectIds.length
    ? await prisma.subjectEnrollment.findMany({
        where: {
          userId: args.userId,
          subjectId: { in: subjectIds },
          status: { in: ["enrolled", "completed"] },
        },
        select: { subjectId: true },
      })
    : [];
  const enrolledSubjectIds = new Set(enrollments.map((row) => row.subjectId));

  return assignments.map((assignment) => ({
    ...assignment,
    enrolled: enrolledSubjectIds.has(assignment.subject.id),
  }));
}

export async function loadTutoringLearningForUser(args: {
  userId: string;
  locale: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { email: true },
  });
  const email = user?.email?.trim().toLowerCase() ?? null;
  await linkTutoringSessionInvitesToUser(prisma, {
    userId: args.userId,
    userEmail: email,
  });

  const sessionSelect = {
    id: true,
    title: true,
    description: true,
    status: true,
    sourceSubjectSlug: true,
    moduleKeys: true,
    updatedAt: true,
    subject: {
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        visibility: true,
      },
    },
    owner: { select: { name: true, email: true } },
  } as const;

  const [participantSessions, invitations] = await Promise.all([
    prisma.tutoringSession.findMany({
      where: {
        status: { in: ["live", "shared"] },
        ...tutoringParticipantWhere(args.userId),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: sessionSelect,
    }),
    prisma.tutoringSessionInvite.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        OR: [
          { invitedUserId: args.userId },
          ...(email ? [{ email }] : []),
        ],
        session: { status: { not: "archived" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        viewedAt: true,
        acceptedAt: true,
        declinedAt: true,
        revokedAt: true,
        expiresAt: true,
        sentAt: true,
        emailStatus: true,
        emailLastAttemptAt: true,
        session: { select: sessionSelect },
      },
    }),
  ]);

  const rowsBySessionId = new Map<string, any>();
  for (const session of participantSessions) {
    rowsBySessionId.set(session.id, { ...session, invitation: null });
  }
  for (const invite of invitations) {
    if (rowsBySessionId.has(invite.session.id)) continue;
    rowsBySessionId.set(invite.session.id, {
      ...invite.session,
      invitation: {
        id: invite.id,
        email: invite.email,
        state: tutoringSessionInviteState(invite),
        emailStatus: invite.emailStatus,
        viewedAt: invite.viewedAt,
        expiresAt: invite.expiresAt,
        sentAt: invite.sentAt,
        emailLastAttemptAt: invite.emailLastAttemptAt,
      },
    });
  }

  const rows = [...rowsBySessionId.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const subjects = await resolveSubjectDeliveryPresentations(
    rows.map((session) => session.subject),
    args.locale,
  );

  return rows.map((session, index) => ({
    ...session,
    subject: subjects[index],
  }));
}
