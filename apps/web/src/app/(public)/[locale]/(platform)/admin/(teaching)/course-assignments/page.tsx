import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import CourseAssignmentsTable from "@/components/admin/course-assignments/CourseAssignmentsTable";

export const dynamic = "force-dynamic";

export default async function CourseAssignmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: "/admin/course-assignments",
  });

  const rawAssignments = await prisma.learningAssignment.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      subject: { select: { id: true, slug: true, title: true, description: true, visibility: true } },
      _count: { select: { users: true, groups: true } },
    },
  });

  const resolvedSubjects = await resolveSubjectDeliveryPresentations(
    rawAssignments.map((assignment) => assignment.subject),
    locale,
  );
  const assignments = rawAssignments.map((assignment, index) => ({
    ...assignment,
    subject: resolvedSubjects[index],
  }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Teaching</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Private course assignments</h1>
          <p className="mt-1 text-sm text-neutral-500">Assign an existing interactive course to individual students or reusable groups.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/learning-groups" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium">Student groups</Link>
          <Link href="/admin/course-assignments/new" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">New assignment</Link>
        </div>
      </div>
      <div className="mt-6"><CourseAssignmentsTable assignments={assignments as any[]} /></div>
    </main>
  );
}
