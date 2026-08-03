import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import TutoringSessionCard from "@/components/tutoring/TutoringSessionCard";
import { buildTutoringSignInHref } from "@/lib/tutoring/tutoringSignInHref";
import { loadTutoringLearningForUser } from "@/lib/learning/myLearningData";

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
    redirect(buildTutoringSignInHref({ locale }));
  }

  const sessions = await loadTutoringLearningForUser({ userId, locale });

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
