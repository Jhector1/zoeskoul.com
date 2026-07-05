import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PracticeDifficulty } from "@zoeskoul/db";
import { getActor } from "@/lib/practice/actor";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sectionSlug = String(body.sectionSlug ?? "");
  const difficulty = String(body.difficulty ?? "easy") as PracticeDifficulty;
  const requestedTargetCount = Number(body.targetCount ?? 10);
  const targetCount = Number.isFinite(requestedTargetCount)
    ? Math.max(1, Math.min(100, Math.floor(requestedTargetCount)))
    : 10;

  if (!sectionSlug) {
    return NextResponse.json({ message: "sectionSlug required" }, { status: 400 });
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
    where: { slug: sectionSlug },
  });
  if (!section) {
    return NextResponse.json({ message: "Section not found" }, { status: 404 });
  }

  const session = await prisma.practiceSession.create({
    data: {
      mode: "standard",
      sectionId: section.id,
      difficulty: Object.values(PracticeDifficulty).includes(difficulty)
        ? difficulty
        : "easy",
      targetCount,
      userId: actor.userId!,
      guestId: null,
      meta: { kind: "subscriber_practice" },
    },
    select: {
      id: true,
      mode: true,
      difficulty: true,
      targetCount: true,
      startedAt: true,
    },
  });

  return NextResponse.json({ session });
}
