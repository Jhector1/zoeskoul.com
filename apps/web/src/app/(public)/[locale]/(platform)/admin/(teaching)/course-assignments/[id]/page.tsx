import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import CourseAssignmentEditor from "@/components/admin/course-assignments/CourseAssignmentEditor";

export const dynamic = "force-dynamic";

export default async function CourseAssignmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: `/admin/course-assignments/${id}`,
  });

  const [rawCourses, groups, assignment] = await Promise.all([
    prisma.practiceSubject.findMany({
      where: { status: "active", visibility: "private" },
      orderBy: [{ visibility: "desc" }, { order: "asc" }],
      select: { id: true, slug: true, title: true, description: true, visibility: true },
    }),
    prisma.learningGroup.findMany({
      where: ownedTeachingRecordWhere(teachingUser),
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, _count: { select: { members: true } } },
    }),
    id === "new"
      ? Promise.resolve(null)
      : prisma.learningAssignment.findFirst({
          where: { id, ...ownedTeachingRecordWhere(teachingUser) },
          include: {
            users: { include: { user: { select: { email: true } } } },
            groups: { select: { groupId: true } },
          },
        }),
  ]);

  if (id !== "new" && !assignment) notFound();

  const courses = await resolveSubjectDeliveryPresentations(rawCourses, locale);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <CourseAssignmentEditor
        initialAssignment={assignment as any}
        courses={courses as any}
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          slug: group.slug,
          memberCount: group._count.members,
        }))}
      />
    </main>
  );
}
