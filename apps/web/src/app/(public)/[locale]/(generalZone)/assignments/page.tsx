import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AssignedCourseCard from "@/components/learningAssignments/AssignedCourseCard";
import { loadAssignedLearningForUser } from "@/lib/learning/myLearningData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AssignedCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const notice = typeof sp.notice === "string" ? sp.notice : null;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/assignments`)}`);
  }

  const assignments = await loadAssignedLearningForUser({ userId, locale });

  return (
    <main className="ui-container py-8">
      <div className="mb-6">
        <div className="ui-section-kicker">My learning</div>
        <h1 className="ui-section-title">Assigned courses</h1>
        <p className="ui-section-subtitle">Private interactive courses shared with you by an instructor or group.</p>
      </div>
      {notice === "invite-accepted-upcoming" ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Your invitation was accepted. The course will appear as available when the instructor&apos;s opening time arrives.
        </div>
      ) : notice === "invite-unavailable" ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The invitation was accepted, but the classroom is not currently open. Contact your instructor if this seems incorrect.
        </div>
      ) : null}
      {assignments.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <AssignedCourseCard
              key={assignment.id}
              assignment={assignment}
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
