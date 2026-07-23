import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tutoringParticipantWhere } from "@/lib/tutoring/sessionAccess";
import TutoringSessionCard from "@/components/tutoring/TutoringSessionCard";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";

export const dynamic = "force-dynamic";

export default async function TutoringSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authSession = await auth();
  const userId = (authSession?.user as any)?.id as string | undefined;
  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/tutoring-sessions`)}`);
  }

  const raw = await prisma.tutoringSession.findMany({
    where: {
      status: { in: ["live", "shared"] },
      ...tutoringParticipantWhere(userId),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      subject: { select: { id: true, slug: true, title: true, description: true, visibility: true } },
      owner: { select: { name: true, email: true } },
    },
  });
  const subjects = await resolveSubjectDeliveryPresentations(raw.map((item) => item.subject), locale);
  const sessions = raw.map((item, index) => ({ ...item, subject: subjects[index] }));

  return (
    <main className="ui-container py-8">
      <div className="mb-6">
        <div className="ui-section-kicker">My learning</div>
        <h1 className="ui-section-title">Tutoring sessions</h1>
        <p className="ui-section-subtitle">
          Reopen the exact lessons, diagrams, boards, quizzes, projects, and saved explanations shared by your tutor.
        </p>
      </div>
      {sessions.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map((session) => <TutoringSessionCard key={session.id} session={session} />)}
        </div>
      ) : (
        <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
          No tutoring sessions have been shared with you yet.
        </div>
      )}
    </main>
  );
}
