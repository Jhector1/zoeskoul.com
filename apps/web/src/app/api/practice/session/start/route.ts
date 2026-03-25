// src/app/api/practice/session/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PracticeDifficulty } from "@prisma/client";
import { getActor } from "@/lib/practice/actor";
// import { getPracticeActor } from "@/lib/practice/actor";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sectionSlug = String(body.sectionSlug ?? "");
  const difficulty = String(body.difficulty ?? "easy") as PracticeDifficulty;
  const targetCount = Number(body.targetCount ?? 10);

  if (!sectionSlug) {
    return NextResponse.json({ message: "sectionSlug required" }, { status: 400 });
  }

  const section = await prisma.practiceSection.findUnique({ where: { slug: sectionSlug } });
  if (!section) {
    return NextResponse.json({ message: "Section not found" }, { status: 404 });
  }

  const actor = await getActor();

  const session = await prisma.practiceSession.create({
    data: {
      sectionId: section.id,
      difficulty: Object.values(PracticeDifficulty).includes(difficulty) ? difficulty : "easy",
      targetCount: Number.isFinite(targetCount) && targetCount > 0 ? targetCount : 10,
      userId: actor.userId ?? null,
      guestId: actor.guestId ?? null,
    },
    select: { id: true, difficulty: true, targetCount: true, startedAt: true },
  });

  return NextResponse.json({ session });
}
