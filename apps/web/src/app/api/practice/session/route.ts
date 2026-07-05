import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import { PracticeDifficulty, PracticeSessionStatus } from "@zoeskoul/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { sectionSlug: string; difficulty: PracticeDifficulty; targetCount?: number }
    | null;

  if (!body?.sectionSlug || !body?.difficulty) {
    return NextResponse.json(
      { message: "sectionSlug and difficulty are required." },
      { status: 400 },
    );
  }

  const actor = await getActor();
  const access = await resolveSubscriberPracticeAccess(prisma, actor);
  if (!access.ok) {
    return NextResponse.json(
      {
        message: access.message,
        code: access.code,
        dailyFiveUrl: "/practice/daily",
        billingUrl: "/billing",
      },
      { status: access.status },
    );
  }

  const section = await prisma.practiceSection.findUnique({
    where: { slug: body.sectionSlug },
  });
  if (!section) {
    return NextResponse.json({ message: "Section not found." }, { status: 404 });
  }

  // Only standard subscriber practice is replaced. Assignment, challenge,
  // onboarding, and daily-practice sessions are separate products and never match.
  await prisma.practiceSession.updateMany({
    where: {
      mode: "standard",
      status: PracticeSessionStatus.active,
      sectionId: section.id,
      difficulty: body.difficulty,
      userId: actor.userId!,
    },
    data: { status: PracticeSessionStatus.completed, completedAt: new Date() },
  });

  const requestedTargetCount = Number(body.targetCount ?? 10);
  const targetCount = Number.isFinite(requestedTargetCount)
    ? Math.max(1, Math.min(100, Math.floor(requestedTargetCount)))
    : 10;

  const session = await prisma.practiceSession.create({
    data: {
      mode: "standard",
      sectionId: section.id,
      difficulty: body.difficulty,
      targetCount,
      userId: actor.userId!,
      guestId: null,
      meta: { kind: "subscriber_practice" },
    },
  });

  return NextResponse.json({
    session: {
      id: session.id,
      mode: session.mode,
      status: session.status,
      targetCount: session.targetCount,
      correct: session.correct,
      total: session.total,
      difficulty: session.difficulty,
      sectionSlug: section.slug,
    },
  });
}
