import { notFound } from "next/navigation";

import TutoringSessionEditor from "@/components/admin/tutoring-sessions/TutoringSessionEditor";
import TutoringLearnerDashboard from "@/components/admin/tutoring-sessions/TutoringLearnerDashboard";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { loadTutoringSessionEditorData } from "@/lib/tutoring/sessionEditorData";
import { loadTutoringLearnerDashboard } from "@/lib/tutoring/sessionProgressSummary";

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
        moduleKeys: true,
        users: { include: { user: { select: { email: true } } } },
        groups: { select: { groupId: true } },
        invites: {
          orderBy: { email: "asc" },
          select: {
            id: true,
            email: true,
            expiresAt: true,
            invitedUserId: true,
            viewedAt: true,
            sentAt: true,
            acceptedAt: true,
            declinedAt: true,
            revokedAt: true,
            emailStatus: true,
            emailLastAttemptAt: true,
            emailError: true,
          },
        },
      },
    }),
  ]);

  if (!session) notFound();
  const learnerDashboard = await loadTutoringLearnerDashboard(prisma, {
    sessionId: session.id,
    moduleKeys: session.moduleKeys,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <TutoringSessionEditor
        initialSession={session as any}
        courses={courses}
        groups={groups}
      />
      <TutoringLearnerDashboard
        sessionId={session.id}
        rows={learnerDashboard}
      />
    </main>
  );
}
