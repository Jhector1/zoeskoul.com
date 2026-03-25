// src/app/api/practice/history/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import type { PracticeDifficulty, PracticeSessionStatus } from "@prisma/client";

export const runtime = "nodejs";

function parseStatus(v: string | null): PracticeSessionStatus | null {
  if (v === "active" || v === "completed") return v;
  return null;
}

function parseDifficulty(v: string | null): PracticeDifficulty | null {
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const takeRaw = Number(searchParams.get("take") ?? "40");
  const take = Math.min(200, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 40));

  const status = parseStatus(searchParams.get("status"));
  const difficulty = parseDifficulty(searchParams.get("difficulty"));

  // default: hide empty sessions
  const includeEmpty = searchParams.get("includeEmpty") === "true";

  const actor = await getActor();
  if (!actor.userId && !actor.guestId) {
    return NextResponse.json({ message: "No actor." }, { status: 401 });
  }

  const where = {
    ...(status ? { status } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(actor.userId ? { userId: actor.userId } : { guestId: actor.guestId! }),

    // ✅ Hide empty sessions by default
    ...(includeEmpty
      ? {}
      : {
          OR: [
            { status: "completed" as const },
            { total: { gt: 0 } },
          ],
        }),
  };

  const sessions = await prisma.practiceSession.findMany({
    where,
    select: {
      id: true,
      status: true,
      difficulty: true,
      targetCount: true,
      total: true,
      correct: true,
      startedAt: true,
      completedAt: true,
      section: { select: { slug: true, title: true } },
    },
    orderBy: { startedAt: "desc" },
    take,
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      difficulty: s.difficulty,
      targetCount: s.targetCount,
      total: s.total,
      correct: s.correct,
      missedCount: Math.max(s.total - s.correct, 0),
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      section: s.section,
    })),
  });
}
