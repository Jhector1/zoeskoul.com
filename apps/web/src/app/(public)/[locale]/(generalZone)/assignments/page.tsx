import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLearningAssignmentsForUser } from "@/lib/learningAssignments/assignmentAccessServer";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import AssignedCourseCard from "@/components/learningAssignments/AssignedCourseCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AssignedCoursesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/assignments`)}`);
  }

  const rawAssignments = await getLearningAssignmentsForUser(prisma, { userId });
  const resolvedSubjects = await resolveSubjectDeliveryPresentations(
    rawAssignments.map((assignment) => assignment.subject),
    locale,
  );
  const assignments = rawAssignments.map((assignment, index) => ({
    ...assignment,
    subject: resolvedSubjects[index],
  }));

  const subjectIds = [...new Set(assignments.map((assignment) => assignment.subject.id))];
  const enrollments = subjectIds.length
    ? await prisma.subjectEnrollment.findMany({
        where: { userId, subjectId: { in: subjectIds }, status: { in: ["enrolled", "completed"] } },
        select: { subjectId: true },
      })
    : [];
  const enrolledSubjectIds = new Set(enrollments.map((row) => row.subjectId));

  return (
    <main className="ui-container py-8">
      <div className="mb-6">
        <div className="ui-section-kicker">My learning</div>
        <h1 className="ui-section-title">Assigned courses</h1>
        <p className="ui-section-subtitle">Private interactive courses shared with you by an instructor or group.</p>
      </div>
      {assignments.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <AssignedCourseCard
              key={assignment.id}
              assignment={{ ...assignment, enrolled: enrolledSubjectIds.has(assignment.subject.id) } as any}
            />
          ))}
        </div>
      ) : (
        <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
          No private courses have been assigned to you yet.
        </div>
      )}
    </main>
  );
}
