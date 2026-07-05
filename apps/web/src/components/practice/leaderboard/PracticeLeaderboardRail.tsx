"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  PracticeExperienceMode,
  PracticeRunViewer,
} from "@/lib/practice/experience/types";
import { shouldShowDailyPracticeLaunchCta } from "./visibility";

type LeaderboardPeriod = "weekly" | "all_time";

type PublicLeaderboardEntry = {
  rank: number;
  name: string;
  image: string | null;
  rankedXp: number;
  totalXp: number;
  level: number;
  isViewer: boolean;
};

type LeaderboardPayload = {
  period: LeaderboardPeriod;
  rankingMetric: "ranked_xp";
  entries: PublicLeaderboardEntry[];
  viewer: PublicLeaderboardEntry | null;
};

type PracticeLeaderboardRailProps = {
  leaderboardUrl: string;
  viewer: PracticeRunViewer;
  experienceMode: PracticeExperienceMode;
  refreshKey: string;
};

function localePrefixFromLeaderboardUrl(url: string) {
  const marker = "/leaderboard";
  const index = url.indexOf(marker);
  return index >= 0 ? url.slice(0, index) || "/en" : "/en";
}

function rankLabel(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `#${rank}`;
}

function LeaderboardRow({ entry }: { entry: PublicLeaderboardEntry }) {
  return (
    <li
      className={[
        "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5",
        "border-b border-[rgb(var(--ui-border)/0.62)] last:border-b-0",
        entry.isViewer
          ? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-300/45 dark:bg-emerald-300/10 dark:ring-emerald-300/25"
          : "",
      ].join(" ")}
      data-viewer={entry.isViewer ? "true" : undefined}
    >
      <span
        className={[
          "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
          entry.rank <= 3
            ? "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100"
            : "bg-[rgb(var(--ui-surface-2)/0.92)] text-[rgb(var(--ui-text-muted)/0.95)]",
        ].join(" ")}
        aria-label={`Rank ${entry.rank}`}
      >
        {entry.rank}
      </span>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {entry.name}
          {entry.isViewer ? (
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
              You
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[rgb(var(--ui-text-muted)/0.82)]">
          Level {entry.level}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold tabular-nums">
          {entry.rankedXp.toLocaleString()}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--ui-text-muted)/0.76)]">
          XP
        </div>
      </div>
    </li>
  );
}

export default function PracticeLeaderboardRail({
  leaderboardUrl,
  viewer,
  experienceMode,
  refreshKey,
}: PracticeLeaderboardRailProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const localePrefix = useMemo(
    () => localePrefixFromLeaderboardUrl(leaderboardUrl),
    [leaderboardUrl],
  );

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ period, limit: "5" });
      const response = await fetch(
        `/api/gamification/leaderboard?${query.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Leaderboard request failed (${response.status}).`);
      }

      const next = (await response.json()) as LeaderboardPayload;
      if (!signal.aborted) setPayload(next);
    } catch (cause) {
      if (signal.aborted) return;
      console.error("[practice leaderboard]", cause);
      setError("The rankings could not be loaded.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey, reloadNonce]);

  const viewerAlreadyInTop = Boolean(
    payload?.viewer && payload.entries.some((entry) => entry.isViewer),
  );

  const fullLeaderboardHref = `${leaderboardUrl}?period=${period}`;
  const dailyFiveHref = `${localePrefix}/practice/daily`;
  const showDailyPracticeLaunch =
    shouldShowDailyPracticeLaunchCta(experienceMode);
  const authenticateHref = `${localePrefix}/authenticate?${new URLSearchParams({
    from: "leaderboard",
    returnTo: dailyFiveHref,
  }).toString()}`;

  return (
    <aside
      className="ui-page-surface min-w-0 overflow-hidden"
      aria-label="Practice leaderboard"
      data-testid="practice-leaderboard-rail"
    >
      <div className="border-b border-[rgb(var(--ui-border)/0.8)] bg-[rgb(var(--ui-surface-2)/0.72)] px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-[rgb(var(--ui-text-muted)/0.82)]">
              Fair ranked practice
            </div>
            <h2 className="mt-1 text-base font-bold tracking-tight">
              Practice leaders
            </h2>
          </div>
          <Link
            className="shrink-0 text-xs font-semibold text-[rgb(var(--ui-accent)/1)] hover:underline"
            href={fullLeaderboardHref}
          >
            View all
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 rounded-lg bg-[rgb(var(--ui-bg)/0.7)] p-1 ring-1 ring-[rgb(var(--ui-border)/0.72)]">
          {(["weekly", "all_time"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={[
                "rounded-md px-2 py-1.5 text-xs font-semibold transition",
                period === value
                  ? "bg-[rgb(var(--ui-surface)/1)] shadow-sm ring-1 ring-[rgb(var(--ui-border)/0.72)]"
                  : "text-[rgb(var(--ui-text-muted)/0.88)] hover:text-[rgb(var(--ui-text)/1)]",
              ].join(" ")}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === "weekly" ? "This week" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {loading && !payload ? (
        <div className="space-y-2 p-3" aria-label="Loading leaderboard">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-lg bg-[rgb(var(--ui-surface-2)/0.82)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 text-sm">
          <p className="text-[rgb(var(--ui-text-muted)/0.9)]">{error}</p>
          <button
            className="ui-btn ui-btn-secondary mt-3"
            type="button"
            onClick={() => setReloadNonce((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : payload?.entries.length ? (
        <ol>{payload.entries.map((entry) => <LeaderboardRow key={entry.rank} entry={entry} />)}</ol>
      ) : (
        <div className="p-5 text-center text-sm text-[rgb(var(--ui-text-muted)/0.86)]">
          No ranked daily-practice results yet.
        </div>
      )}

      {payload?.viewer && !viewerAlreadyInTop ? (
        <div className="border-t border-[rgb(var(--ui-border)/0.8)] bg-[rgb(var(--ui-surface-2)/0.52)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.78)]">
            Your position
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-[rgb(var(--ui-surface)/0.96)] px-3 py-2.5 ring-1 ring-[rgb(var(--ui-border)/0.75)]">
            <div className="min-w-0">
              <div className="font-bold">{rankLabel(payload.viewer.rank)}</div>
              <div className="truncate text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                {payload.viewer.name}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums">
                {payload.viewer.rankedXp.toLocaleString()}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--ui-text-muted)/0.75)]">
                Ranked XP
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t border-[rgb(var(--ui-border)/0.8)] p-3.5">
        {experienceMode === "daily_five" ? (
          <p className="text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">
            {payload?.viewer
              ? "Keep going. This session is updating your fair Ranked XP."
              : "Complete this Daily Practice session to enter the rankings."}
          </p>
        ) : !viewer.authenticated ? (
          <>
            <p className="text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">
              Create an account to earn Ranked XP and appear here.
            </p>
            <Link className="ui-btn ui-btn-primary mt-3 w-full justify-center" href={authenticateHref}>
              Create an account
            </Link>
          </>
        ) : payload?.viewer ? (
          <>
            <p className="text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">
              Ranked XP is capped fairly. Unlimited subscriber practice cannot buy a higher rank.
            </p>
            {showDailyPracticeLaunch ? (
              <Link className="ui-btn ui-btn-secondary mt-3 w-full justify-center" href={dailyFiveHref}>
                Open Daily Practice
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">
              Complete today&apos;s daily practice to enter the rankings.
            </p>
            {showDailyPracticeLaunch ? (
              <Link className="ui-btn ui-btn-primary mt-3 w-full justify-center" href={dailyFiveHref}>
                Start Daily Practice
              </Link>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
