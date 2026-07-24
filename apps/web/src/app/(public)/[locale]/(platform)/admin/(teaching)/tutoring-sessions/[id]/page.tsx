import { notFound } from "next/navigation";

import TutoringSessionEditor from "@/components/admin/tutoring-sessions/TutoringSessionEditor";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { loadTutoringSessionEditorData } from "@/lib/tutoring/sessionEditorData";

export const dynamic = "force-dynamic";

export default async function TutoringSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: `/admin/tutoring-sessions/${id}`,
  });

  const [{ courses, groups }, session] = await Promise.all([
    loadTutoringSessionEditorData({ locale, teachingUser }),
    prisma.tutoringSession.findFirst({
      where: { id, ...ownedTeachingRecordWhere(teachingUser) },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        subjectId: true,
        selectionScope: true,
        sourceModuleSlug: true,
        sourceSectionSlug: true,
        sourceTopicId: true,
        status: true,
        allowStudentEditing: true,
        users: { include: { user: { select: { email: true } } } },
        groups: { select: { groupId: true } },
        invites: {
          orderBy: { email: "asc" },
          select: {
            id: true,
            email: true,
            expiresAt: true,
            sentAt: true,
            acceptedAt: true,
            revokedAt: true,
          },
        },
      },
    }),
  ]);

  if (!session) notFound();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <TutoringSessionEditor
        initialSession={session as any}
        courses={courses}
        groups={groups}
      />
    </main>
  );
}
