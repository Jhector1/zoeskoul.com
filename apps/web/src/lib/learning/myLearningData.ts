import "server-only";

import { prisma } from "@/lib/prisma";
import { getLearningAssignmentsForUser } from "@/lib/learningAssignments/assignmentAccessServer";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import { tutoringParticipantWhere } from "@/lib/tutoring/sessionAccess";

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
  const rawSessions = await prisma.tutoringSession.findMany({
    where: {
      status: { in: ["live", "shared"] },
      ...tutoringParticipantWhere(args.userId),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
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
    },
  });
  const subjects = await resolveSubjectDeliveryPresentations(
    rawSessions.map((session) => session.subject),
    args.locale,
  );

  return rawSessions.map((session, index) => ({
    ...session,
    subject: subjects[index],
  }));
}
