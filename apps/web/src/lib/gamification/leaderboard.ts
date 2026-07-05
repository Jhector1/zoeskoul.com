import "server-only";

import type { PrismaClient } from "@/lib/prisma";

export type LeaderboardPeriod = "weekly" | "all_time";

export type LeaderboardEntry = {
  rank: number;
  actorKey: string;
  userId: string;
  name: string;
  image: string | null;
  rankedXp: number;
  totalXp: number;
  level: number;
};

export type PublicLeaderboardEntry = Omit<
  LeaderboardEntry,
  "actorKey" | "userId"
> & {
  isViewer: boolean;
};

export type LeaderboardSnapshot = {
  period: LeaderboardPeriod;
  entries: PublicLeaderboardEntry[];
  viewer: PublicLeaderboardEntry | null;
};

type ViewerIdentity = {
  actorKey: string;
  userId: string;
};

type RankRow = {
  rank: bigint | number;
  rankedXp: bigint | number;
};

function startOfCurrentUtcWeek(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = start.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function anonymousLabel(userId: string) {
  return `Learner ${userId.slice(-4).toUpperCase()}`;
}

function safeNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return Number(value ?? 0);
}

function toPublicEntry(
  entry: LeaderboardEntry,
  viewerActorKey: string | null,
): PublicLeaderboardEntry {
  return {
    rank: entry.rank,
    name: entry.name,
    image: entry.image,
    rankedXp: entry.rankedXp,
    totalXp: entry.totalXp,
    level: entry.level,
    isViewer: entry.actorKey === viewerActorKey,
  };
}

export async function getRankedLeaderboard(args: {
  prisma: PrismaClient;
  period: LeaderboardPeriod;
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 50, 100));

  if (args.period === "weekly") {
    const grouped = await args.prisma.xpEvent.groupBy({
      by: ["actorKey", "userId"],
      where: {
        userId: { not: null },
        rankedXpDelta: { gt: 0 },
        createdAt: { gte: startOfCurrentUtcWeek() },
      },
      _sum: { rankedXpDelta: true },
      orderBy: [
        { _sum: { rankedXpDelta: "desc" } },
        { actorKey: "asc" },
      ],
      take: limit,
    });

    const actorKeys = grouped.map((row) => row.actorKey);
    const progress = await args.prisma.learnerProgress.findMany({
      where: { actorKey: { in: actorKeys } },
      select: { actorKey: true, totalXp: true, level: true },
    });
    const progressByActor = new Map(
      progress.map((row) => [row.actorKey, row] as const),
    );

    return grouped.map((row, index) => {
      const userId = row.userId as string;
      const learner = progressByActor.get(row.actorKey);
      return {
        rank: index + 1,
        actorKey: row.actorKey,
        userId,
        // Use a stable pseudonymous label until a learner explicitly opts in to
        // publishing a leaderboard display name.
        name: anonymousLabel(userId),
        image: null,
        rankedXp: row._sum.rankedXpDelta ?? 0,
        totalXp: learner?.totalXp ?? 0,
        level: learner?.level ?? 1,
      };
    });
  }

  const rows = await args.prisma.learnerProgress.findMany({
    where: {
      userId: { not: null },
      rankedXp: { gt: 0 },
    },
    orderBy: [
      { rankedXp: "desc" },
      { updatedAt: "asc" },
      { actorKey: "asc" },
    ],
    take: limit,
    select: {
      actorKey: true,
      userId: true,
      rankedXp: true,
      totalXp: true,
      level: true,
    },
  });

  return rows.map((row, index) => {
    const userId = row.userId as string;
    return {
      rank: index + 1,
      actorKey: row.actorKey,
      userId,
      name: anonymousLabel(userId),
      image: null,
      rankedXp: row.rankedXp,
      totalXp: row.totalXp,
      level: row.level,
    };
  });
}

async function getViewerEntry(args: {
  prisma: PrismaClient;
  period: LeaderboardPeriod;
  viewer: ViewerIdentity;
}): Promise<LeaderboardEntry | null> {
  const progress = await args.prisma.learnerProgress.findUnique({
    where: { actorKey: args.viewer.actorKey },
    select: {
      totalXp: true,
      rankedXp: true,
      level: true,
    },
  });

  if (!progress) return null;

  let rankRows: RankRow[];

  if (args.period === "weekly") {
    const weekStart = startOfCurrentUtcWeek();
    rankRows = await args.prisma.$queryRaw<RankRow[]>`
      WITH weekly AS (
        SELECT
          "actorKey",
          SUM("rankedXpDelta")::bigint AS "rankedXp"
        FROM "XpEvent"
        WHERE
          "userId" IS NOT NULL
          AND "rankedXpDelta" > 0
          AND "createdAt" >= ${weekStart}
        GROUP BY "actorKey"
      ), ranked AS (
        SELECT
          "actorKey",
          "rankedXp",
          ROW_NUMBER() OVER (
            ORDER BY "rankedXp" DESC, "actorKey" ASC
          ) AS "rank"
        FROM weekly
      )
      SELECT "rank", "rankedXp"
      FROM ranked
      WHERE "actorKey" = ${args.viewer.actorKey}
      LIMIT 1
    `;
  } else {
    rankRows = await args.prisma.$queryRaw<RankRow[]>`
      WITH ranked AS (
        SELECT
          "actorKey",
          "rankedXp"::bigint AS "rankedXp",
          ROW_NUMBER() OVER (
            ORDER BY "rankedXp" DESC, "updatedAt" ASC, "actorKey" ASC
          ) AS "rank"
        FROM "LearnerProgress"
        WHERE "userId" IS NOT NULL AND "rankedXp" > 0
      )
      SELECT "rank", "rankedXp"
      FROM ranked
      WHERE "actorKey" = ${args.viewer.actorKey}
      LIMIT 1
    `;
  }

  const row = rankRows[0];
  if (!row || safeNumber(row.rankedXp) <= 0) return null;

  return {
    rank: safeNumber(row.rank),
    actorKey: args.viewer.actorKey,
    userId: args.viewer.userId,
    name: anonymousLabel(args.viewer.userId),
    image: null,
    rankedXp: safeNumber(row.rankedXp),
    totalXp: progress.totalXp,
    level: progress.level,
  };
}

export async function getLeaderboardSnapshot(args: {
  prisma: PrismaClient;
  period: LeaderboardPeriod;
  limit?: number;
  viewer?: ViewerIdentity | null;
}): Promise<LeaderboardSnapshot> {
  const viewerActorKey = args.viewer?.actorKey ?? null;
  const [entries, viewerEntry] = await Promise.all([
    getRankedLeaderboard({
      prisma: args.prisma,
      period: args.period,
      limit: args.limit,
    }),
    args.viewer
      ? getViewerEntry({
          prisma: args.prisma,
          period: args.period,
          viewer: args.viewer,
        })
      : Promise.resolve(null),
  ]);

  return {
    period: args.period,
    entries: entries.map((entry) => toPublicEntry(entry, viewerActorKey)),
    viewer: viewerEntry
      ? toPublicEntry(viewerEntry, viewerActorKey)
      : null,
  };
}
