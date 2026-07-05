import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLeaderboardSnapshot,
  type LeaderboardPeriod,
} from "@/lib/gamification/leaderboard";
import { actorKeyOf, getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period: LeaderboardPeriod =
    url.searchParams.get("period") === "all_time" ? "all_time" : "weekly";
  const rawLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(Math.trunc(rawLimit), 100))
    : 50;

  const actor = await getActor();
  const viewer = actor.userId
    ? {
        actorKey: actorKeyOf(actor),
        userId: actor.userId,
      }
    : null;

  const snapshot = await getLeaderboardSnapshot({
    prisma,
    period,
    limit,
    viewer,
  });

  return NextResponse.json(
    {
      ...snapshot,
      rankingMetric: "ranked_xp" as const,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    },
  );
}
