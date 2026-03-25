// src/app/api/assignments/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const actor = await getActor(); // ok if empty
  const now = new Date();

  const assignmentsPromise = prisma.assignment.findMany({
    where: {
      status: "published",
      AND: [
        { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
        { OR: [{ dueAt: null }, { dueAt: { gte: now } }] },
      ],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      allowReveal: true,
      showDebug: true,
      // ✅ topics is now a join table
      topics: {
        orderBy: { order: "asc" },
        select: { topic: { select: { slug: true } } },
      },

      difficulty: true,

      questionCount: true,
      availableFrom: true,
      dueAt: true,
      timeLimitSec: true,
      maxAttempts: true,
    },
  });

  type AssignmentRow = Awaited<typeof assignmentsPromise>[number];
  const assignments = await assignmentsPromise;

  // optional: attempts remaining (only if actor exists)
  let counts = new Map<string, number>();

  if (actor.userId || actor.guestId) {
    const rows = await prisma.practiceSession.groupBy({
      by: ["assignmentId"],
      where: {
        assignmentId: { in: assignments.map((a: AssignmentRow) => a.id) },
        ...(actor.userId
          ? { userId: actor.userId }
          : { guestId: actor.guestId }),
      },
      _count: { _all: true },
    });

    counts = new Map(rows.map((r: any) => [r.assignmentId!, r._count._all]));
  }

  return NextResponse.json({
    assignments: assignments.map((a: AssignmentRow) => {
      const used = counts.get(a.id) ?? 0;

      // ✅ flatten join rows -> string[]
      const topicSlugs = (a.topics ?? [])
        .map((t) => t.topic?.slug)
        .filter(Boolean) as string[];

      return {
        ...a,
        topics: topicSlugs,

        attemptsUsed: used,
        attemptsRemaining:
          a.maxAttempts == null ? null : Math.max(0, a.maxAttempts - used),
      };
    }),
  });
}
