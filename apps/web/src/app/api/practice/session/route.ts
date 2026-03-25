// src/app/api/practice/session/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { PracticeDifficulty, PracticeSessionStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { sectionSlug: string; difficulty: PracticeDifficulty; targetCount?: number }
    | null;

  if (!body?.sectionSlug || !body?.difficulty) {
    return NextResponse.json({ message: "sectionSlug and difficulty are required." }, { status: 400 });
  }

  const actor = await getActor();

  const section = await prisma.practiceSection.findUnique({
    where: { slug: body.sectionSlug },
  });

  if (!section) {
    return NextResponse.json({ message: "Section not found." }, { status: 404 });
  }

  // Optional: auto-complete any active session for same actor+section+difficulty
  await prisma.practiceSession.updateMany({
    where: {
      status: PracticeSessionStatus.active,
      sectionId: section.id,
      difficulty: body.difficulty,
      OR: [
        actor.userId ? { userId: actor.userId } : undefined,
        actor.guestId ? { guestId: actor.guestId } : undefined,
      ].filter(Boolean) as any,
    },
    data: { status: PracticeSessionStatus.completed, completedAt: new Date() },
  });

  const session = await prisma.practiceSession.create({
    data: {
      sectionId: section.id,
      difficulty: body.difficulty,
      targetCount: body.targetCount ?? 10,
      userId: actor.userId ?? null,
      guestId: actor.guestId ?? null,
    },
  });

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      targetCount: session.targetCount,
      correct: session.correct,
      total: session.total,
      difficulty: session.difficulty,
      sectionSlug: section.slug,
    },
  });
}
