// src/app/api/progress/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";

type RangeId = "7d" | "30d" | "90d";
type Difficulty = "easy" | "medium" | "hard";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function parseRange(x: string | null): RangeId {
  return x === "7d" || x === "90d" || x === "30d" ? x : "30d";
}

function parseDifficulty(x: string | null): Difficulty | "all" {
  return x === "easy" || x === "medium" || x === "hard" ? x : "all";
}

function parseTopic(x: string | null): string | "all" {
  if (!x || x === "all") return "all";
  return x;
}

function buildActorWhere(actor: { userId?: string | null; guestId?: string | null }) {
  const OR = [
    actor.userId ? { userId: actor.userId } : undefined,
    actor.guestId ? { guestId: actor.guestId } : undefined,
  ].filter(Boolean) as any[];

  // If somehow neither exists, force empty match
  if (!OR.length) return { userId: "__none__" };

  return { OR };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const range = parseRange(searchParams.get("range"));
  const topic = parseTopic(searchParams.get("topic"));
  const difficulty = parseDifficulty(searchParams.get("difficulty"));

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const from = daysAgo(days);

  const actor = await getActor();
  const whereActor = buildActorWhere(actor);

  // ---- Instance-level filters ----
  // topic filter uses PracticeTopic.genKey (your scalable mapping)
  const instanceWhere: any = {};
  if (difficulty !== "all") instanceWhere.difficulty = difficulty;
  if (topic !== "all") instanceWhere.topic = { genKey: topic };

  // ---- Attempts in range (+filters) ----
  const attempts = await prisma.practiceAttempt.findMany({
    where: {
      ...whereActor,
      createdAt: { gte: from },
      instance: instanceWhere,
    },
    include: {
      instance: {
        select: {
          id: true,
          kind: true,
          difficulty: true,
          title: true,
          prompt: true,
          secretPayload: true,
          topic: { select: { slug: true, genKey: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalAttempts = attempts.length;
  const correctAttempts = attempts.reduce((s, a) => s + (a.ok ? 1 : 0), 0);
  const accuracy = totalAttempts ? correctAttempts / totalAttempts : 0;

  // ---- Sessions completed (range + difficulty filter only) ----
  // Sessions do not have a single topic (topic is per instance),
  // so we do NOT apply topic filter here.
  const sessionsCompleted = await prisma.practiceSession.count({
    where: {
      ...whereActor,
      status: "completed",
      completedAt: { gte: from },
      ...(difficulty !== "all" ? { difficulty } : {}),
    },
  });

  // ---- Aggregations ----
  const byTopicMap = new Map<string, { attempts: number; correct: number }>();
  const byDiffMap = new Map<string, { attempts: number; correct: number }>();
  const byDayMap = new Map<string, { attempts: number; correct: number }>();

  for (const a of attempts) {
    const topicKey = a.instance.topic.genKey ?? a.instance.topic.slug; // ✅ string
    const diffKey = a.instance.difficulty;

    byTopicMap.set(topicKey, {
      attempts: (byTopicMap.get(topicKey)?.attempts ?? 0) + 1,
      correct: (byTopicMap.get(topicKey)?.correct ?? 0) + (a.ok ? 1 : 0),
    });

    byDiffMap.set(diffKey, {
      attempts: (byDiffMap.get(diffKey)?.attempts ?? 0) + 1,
      correct: (byDiffMap.get(diffKey)?.correct ?? 0) + (a.ok ? 1 : 0),
    });

    const day = a.createdAt.toISOString().slice(0, 10);
    byDayMap.set(day, {
      attempts: (byDayMap.get(day)?.attempts ?? 0) + 1,
      correct: (byDayMap.get(day)?.correct ?? 0) + (a.ok ? 1 : 0),
    });
  }

  const byTopic = Array.from(byTopicMap.entries()).map(([topic, v]) => ({
    topic,
    attempts: v.attempts,
    correct: v.correct,
    accuracy: v.attempts ? v.correct / v.attempts : 0,
  }));

  const byDifficulty = Array.from(byDiffMap.entries()).map(([difficulty, v]) => ({
    difficulty,
    attempts: v.attempts,
    correct: v.correct,
    accuracy: v.attempts ? v.correct / v.attempts : 0,
  }));

  const accuracyTimeline = Array.from(byDayMap.entries()).map(([date, v]) => ({
    date,
    attempts: v.attempts,
    correct: v.correct,
    accuracy: v.attempts ? v.correct / v.attempts : 0,
  }));

  const bestTopic =
    byTopic
      .filter((x) => x.attempts >= 5)
      .sort((a, b) => b.accuracy - a.accuracy)[0]?.topic ??
    byTopic.sort((a, b) => b.attempts - a.attempts)[0]?.topic ??
    "—";

  // ---- Recent sessions (keep topic as section slug; UI can display it) ----
  const recentSessionsRaw = await prisma.practiceSession.findMany({
    where: {
      ...whereActor,
      status: "completed",
      ...(difficulty !== "all" ? { difficulty } : {}),
    },
    include: { section: { select: { slug: true } } },
    orderBy: { completedAt: "desc" },
    take: 12,
  });

  const recentSessions = recentSessionsRaw.map((s) => ({
    id: s.id,
    createdAt: (s.completedAt ?? s.startedAt).toISOString(),
    topic: s.section.slug, // ✅ better than "dot"
    difficulty: s.difficulty,
    totalCount: s.total,
    correctCount: s.correct,
    accuracy: s.total ? s.correct / s.total : 0,
  }));

  // ---- Missed ----
  const missedRaw = await prisma.practiceAttempt.findMany({
    where: {
      ...whereActor,
      ok: false,
      revealUsed: false,
      createdAt: { gte: from },
      instance: instanceWhere,
    },
    include: {
      instance: {
        select: {
          kind: true,
          difficulty: true,
          title: true,
          prompt: true,
          secretPayload: true,
          topic: { select: { slug: true, genKey: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const missed = missedRaw.map((a) => ({
    occurredAt: a.createdAt.toISOString(),
    topic: a.instance.topic.genKey ?? a.instance.topic.slug,
    difficulty: a.instance.difficulty,
    kind: a.instance.kind,
    title: a.instance.title,
    prompt: a.instance.prompt,
    userAnswer: a.answerPayload,
    expected:
      (a.instance.secretPayload as any)?.expected ??
      (a.instance.secretPayload as any)?.correctOptionId ??
      (a.instance.secretPayload as any)?.targetA,
    explanation: undefined,
  }));

  // ---- Streak (based on attempts in range) ----
  const daysWithAttempts = new Set(attempts.map((a) => a.createdAt.toISOString().slice(0, 10)));
  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (daysWithAttempts.has(key)) streakDays++;
    else break;
  }

  return NextResponse.json({
    totals: {
      sessionsCompleted,
      attempts: totalAttempts,
      correct: correctAttempts,
      accuracy,
      bestTopic,
      streakDays,
    },
    byTopic,
    byDifficulty,
    accuracyTimeline,
    recentSessions,
    missed,
    meta: { range, topic, difficulty },
  });
}
