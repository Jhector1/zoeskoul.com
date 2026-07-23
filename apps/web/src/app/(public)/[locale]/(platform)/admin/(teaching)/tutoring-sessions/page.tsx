import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";

export const dynamic = "force-dynamic";

function openLabel(status: "draft" | "live" | "shared" | "archived") {
  if (status === "draft") return "Open draft";
  if (status === "shared") return "Open review";
  if (status === "archived") return "Preview";
  return "Open session";
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireTeachingPageUser({
    locale,
    callbackPath: "/admin/tutoring-sessions",
  });
  const rawSessions = await prisma.tutoringSession.findMany({
    where: ownedTeachingRecordWhere(user),
    orderBy: { updatedAt: "desc" },
    include: {
      subject: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          visibility: true,
        },
      },
      _count: { select: { users: true, groups: true, documents: true } },
    },
  });
  const subjects = await resolveSubjectDeliveryPresentations(
    rawSessions.map((session) => session.subject),
    locale,
  );
  const sessions = rawSessions.map((session, index) => ({
    ...session,
    subject: subjects[index],
  }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase text-neutral-500">Teaching</div>
          <h1 className="text-3xl font-semibold">Private tutoring sessions</h1>
          <p className="text-sm text-neutral-500">
            Teach live, annotate the shared board, then preserve the exact session for review.
          </p>
        </div>
        <Link
          href="/admin/tutoring-sessions/new"
          className="rounded-lg bg-black px-4 py-2 text-white"
        >
          New session
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border bg-white">
        {sessions.length ? (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-4 border-b p-4 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-medium">{session.title}</div>
                <div className="text-xs text-neutral-500">
                  {session.subject.title} · {session.selectionScope} · {session._count.users}{" "}
                  students · {session._count.groups} groups · {session._count.documents} saved boards
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border px-3 py-1 text-xs font-medium capitalize text-neutral-600">
                  {session.status}
                </span>
                <Link
                  href={`/tutoring-sessions/${session.id}`}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium"
                >
                  {openLabel(session.status)}
                </Link>
                <Link
                  href={`/admin/tutoring-sessions/${session.id}`}
                  className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-sm text-neutral-500">
            No tutoring sessions yet. Create one from an existing course, module, section, or topic.
          </div>
        )}
      </div>
    </main>
  );
}
