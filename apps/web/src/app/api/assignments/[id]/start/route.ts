// src/app/api/assignments/[id]/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, ensureGuestId, attachGuestCookie } from "@/lib/practice/actor";
import { requireEntitledUser } from "@/lib/billing/requireEntitledUser";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await params;

  const actor0 = await getActor();
  const ensured = ensureGuestId(actor0);
  const setGuestId = ensured.setGuestId ?? null;

  // ✅ hard-block if not subscribed
  const gate = await requireEntitledUser();
  if (!gate.ok) {
    // keep guest cookie behavior consistent
    return attachGuestCookie(gate.res, setGuestId);
  }

  const now = new Date();

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sectionId: true,
      difficulty: true,
      questionCount: true,
      availableFrom: true,
      dueAt: true,
      maxAttempts: true,
    },
  });

  if (!assignment || assignment.status !== "published") {
    const res = NextResponse.json({ message: "Assignment not available." }, { status: 404 });
    return attachGuestCookie(res, setGuestId);
  }
  if (assignment.availableFrom && now < assignment.availableFrom) {
    const res = NextResponse.json({ message: "Not open yet." }, { status: 403 });
    return attachGuestCookie(res, setGuestId);
  }
  if (assignment.dueAt && now > assignment.dueAt) {
    const res = NextResponse.json({ message: "Past due." }, { status: 403 });
    return attachGuestCookie(res, setGuestId);
  }

  if (assignment.maxAttempts != null) {
    const used = await prisma.practiceSession.count({
      where: {
        assignmentId: assignment.id,
        userId: gate.userId, // ✅ count attempts per entitled user
      },
    });

    if (used >= assignment.maxAttempts) {
      const res = NextResponse.json({ message: "No attempts remaining." }, { status: 403 });
      return attachGuestCookie(res, setGuestId);
    }
  }

  const session = await prisma.practiceSession.create({
    data: {
      assignmentId: assignment.id,
      sectionId: assignment.sectionId,
      difficulty: assignment.difficulty,
      targetCount: assignment.questionCount,

      userId: gate.userId, // ✅ ALWAYS entitled user
      guestId: null,
    },
    select: { id: true },
  });

  const res = NextResponse.json({ sessionId: session.id });
  return attachGuestCookie(res, setGuestId);
}
