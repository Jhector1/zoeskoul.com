import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getLeaderboardSnapshot,
  type LeaderboardPeriod,
} from "@/lib/gamification/leaderboard";
import { actorKeyOf, getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const period: LeaderboardPeriod =
    query.period === "all_time" ? "all_time" : "weekly";
  const actor = await getActor();
  const snapshot = await getLeaderboardSnapshot({
    prisma,
    period,
    limit: 50,
    viewer: actor.userId
      ? { actorKey: actorKeyOf(actor), userId: actor.userId }
      : null,
  });
  const viewerIsListed = snapshot.entries.some((entry) => entry.isViewer);

  return (
    <main className="ui-container py-8 sm:py-10">
      <section className="mx-auto max-w-4xl space-y-5">
        <div className="ui-page-surface overflow-hidden">
          <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-5 py-5 sm:px-6">
            <div className="ui-kicker">Fair ranked practice</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Leaderboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--ui-text-muted)/0.86)] sm:text-base">
              Ranked XP comes from Daily Practice. Subscriber-only unlimited practice
              and repeated public links do not buy extra leaderboard points.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 p-4 sm:p-5">
            <Link
              className={period === "weekly" ? "ui-btn-primary" : "ui-btn-secondary"}
              href={`/${locale}/leaderboard?period=weekly`}
            >
              This week
            </Link>
            <Link
              className={period === "all_time" ? "ui-btn-primary" : "ui-btn-secondary"}
              href={`/${locale}/leaderboard?period=all_time`}
            >
              All time
            </Link>
            <Link className="ui-btn-secondary" href={`/${locale}/practice/daily`}>
              Start Daily Practice
            </Link>
          </div>
        </div>

        {snapshot.viewer && !viewerIsListed ? (
          <div className="ui-page-surface overflow-hidden border-emerald-300/45 bg-emerald-50/65 p-4 dark:border-emerald-300/25 dark:bg-emerald-300/10 sm:p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
              Your position
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-bold">#{snapshot.viewer.rank}</div>
                <div className="text-sm text-[rgb(var(--ui-text-muted)/0.88)]">
                  {snapshot.viewer.name} · Level {snapshot.viewer.level}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold tabular-nums">
                  {snapshot.viewer.rankedXp.toLocaleString()}
                </div>
                <div className="text-xs uppercase tracking-wide text-[rgb(var(--ui-text-muted)/0.78)]">
                  Ranked XP
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="ui-page-surface overflow-hidden">
          <div className="grid grid-cols-[4rem_minmax(0,1fr)_7rem] border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ui-text-muted)/0.9)] sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5">
            <span>Rank</span>
            <span>Learner</span>
            <span className="text-right">Ranked XP</span>
          </div>

          {snapshot.entries.length ? (
            <ol>
              {snapshot.entries.map((entry) => (
                <li
                  className={[
                    "grid grid-cols-[4rem_minmax(0,1fr)_7rem] items-center border-b border-[rgb(var(--ui-border)/0.65)] px-4 py-4 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5",
                    entry.isViewer
                      ? "bg-emerald-50/75 ring-1 ring-inset ring-emerald-300/40 dark:bg-emerald-300/10 dark:ring-emerald-300/20"
                      : "",
                  ].join(" ")}
                  key={entry.rank}
                >
                  <span className="text-lg font-semibold">#{entry.rank}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {entry.name}
                      {entry.isViewer ? (
                        <span className="ml-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                          You
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-[rgb(var(--ui-text-muted)/0.8)]">
                      Level {entry.level} · {entry.totalXp.toLocaleString()} learning XP
                    </div>
                  </div>
                  <span className="text-right font-semibold tabular-nums">
                    {entry.rankedXp.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="p-8 text-center text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
              No ranked daily-practice results yet.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
