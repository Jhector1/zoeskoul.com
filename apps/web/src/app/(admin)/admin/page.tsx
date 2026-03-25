import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ---- Typed query promises (avoid Prisma namespace types entirely) ----
const recentAssignmentsPromise = prisma.assignment.findMany({
  orderBy: [{ updatedAt: "desc" }],
  take: 6,
  include: { section: { select: { title: true, slug: true } } },
});
type RecentAssignment = Awaited<typeof recentAssignmentsPromise>[number];

const recentSessionsPromise = prisma.practiceSession.findMany({
  orderBy: [{ startedAt: "desc" }],
  take: 8,
  include: {
    section: { select: { title: true, slug: true } },
    assignment: { select: { id: true, title: true, slug: true } },
  },
});
type RecentSession = Awaited<typeof recentSessionsPromise>[number];

// ---- UI helpers ----
function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-xs font-medium text-neutral-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  );
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export default async function AdminDashboardPage() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    sectionsCount,
    assignmentsCount,
    publishedAssignmentsCount,
    sessions7d,
    attempts7d,
    correct7d,
    recentAssignments,
    recentSessions,
    seriesRows,
  ] = await Promise.all([
    prisma.practiceSection.count(),
    prisma.assignment.count(),
    prisma.assignment.count({ where: { status: "published" } }),

    prisma.practiceSession.count({ where: { startedAt: { gte: d7 } } }),

    prisma.practiceAttempt.count({ where: { createdAt: { gte: d7 } } }),
    prisma.practiceAttempt.count({ where: { createdAt: { gte: d7 }, ok: true } }),

    recentAssignmentsPromise,
    recentSessionsPromise,

    // Attempts per day for last 14 days (Postgres)
    prisma.$queryRaw<Array<{ day: Date; attempts: number; correct: number }>>`
      SELECT
        date_trunc('day', "createdAt") AS day,
        COUNT(*)::int AS attempts,
        COALESCE(SUM(CASE WHEN "ok" THEN 1 ELSE 0 END), 0)::int AS correct
      FROM "PracticeAttempt"
      WHERE "createdAt" >= ${d14}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const accuracy7d = attempts7d ? correct7d / attempts7d : NaN;

  // Build a dense last-14-days series with zero-fill
  const map = new Map<string, { attempts: number; correct: number }>();
  for (const r of seriesRows) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    map.set(key, { attempts: r.attempts ?? 0, correct: r.correct ?? 0 });
  }

  const series = Array.from({ length: 14 }).map((_, i) => {
    const day = new Date(d14.getTime() + i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    const v = map.get(key) ?? { attempts: 0, correct: 0 };
    const acc = v.attempts ? v.correct / v.attempts : 0;
    return {
      day: key, // "YYYY-MM-DD"
      attempts: v.attempts,
      correct: v.correct,
      accuracy: Math.round(acc * 100),
    };
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Quick stats + recent activity.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/assignments"
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Assignments
          </Link>
          <Link
            href="/practice/sections"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Practice (public)
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Practice sections" value={sectionsCount} />
        <Card
          title="Assignments"
          value={assignmentsCount}
          hint={`${publishedAssignmentsCount} published`}
        />
        <Card title="Sessions (last 7d)" value={sessions7d} />
        <Card
          title="Accuracy (last 7d)"
          value={fmtPct(accuracy7d)}
          hint={`${correct7d}/${attempts7d} attempts`}
        />
      </div>

      {/* Chart + quick actions */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-neutral-900">Last 14 days</div>
              <div className="mt-1 text-xs text-neutral-500">Attempts + accuracy</div>
            </div>
          </div>

          <div className="mt-4">
            {/* IMPORTANT: fixed height container prevents width(-1)/height(-1) */}
            <div className="h-72 w-full min-w-0">
              {/* client chart */}
              <AdminAttemptsChart data={series} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm font-medium text-neutral-900">Quick actions</div>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/admin/assignments/new"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              New assignment
            </Link>
            <Link
              href="/admin/assignments"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              Manage assignments
            </Link>
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm font-medium text-neutral-900">Recent assignments</div>
          <div className="mt-3 divide-y divide-neutral-200">
            {recentAssignments.map((a: RecentAssignment) => (
              <div key={a.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900">
                      {a.title}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {a.status} • {a.section?.title ?? "—"} • {a.slug}
                    </div>
                  </div>
                  <Link
                    href={`/admin/assignments/${a.id}`}
                    className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
            {!recentAssignments.length && (
              <div className="py-4 text-sm text-neutral-600">No assignments yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm font-medium text-neutral-900">Recent sessions</div>
          <div className="mt-3 divide-y divide-neutral-200">
            {recentSessions.map((s: RecentSession) => (
              <div key={s.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900">
                      {s.section?.title ?? "—"} • {s.difficulty}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {s.status} • {new Date(s.startedAt).toLocaleString()}
                      {s.assignment ? ` • assignment: ${s.assignment.title}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-neutral-600">
                    {s.correct}/{s.total}
                  </div>
                </div>
              </div>
            ))}
            {!recentSessions.length && (
              <div className="py-4 text-sm text-neutral-600">No sessions yet.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Lazy import client chart:
 * keep this at bottom to avoid bundling recharts on server.
 */
import AdminAttemptsChart from "@/components/admin/AdminAttemptsChart";
