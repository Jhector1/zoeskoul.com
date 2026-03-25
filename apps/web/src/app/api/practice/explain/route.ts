// src/app/api/practice/explain/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachGuestCookie, ensureGuestId, getActor } from "@/lib/practice/actor";
import { verifyPracticeKey } from "@/lib/practice/key";
import { requireEntitledUser } from "@/lib/billing/requireEntitledUser";
import { explainPracticeConcept } from "@/lib/ai/explainPractice";

export const runtime = "nodejs";

function normalizeKey(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const any = input as any;
    if (typeof any.token === "string") return any.token;
    if (typeof any.key === "string") return any.key;
    if (typeof any.value === "string") return any.value;
  }
  return null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { key?: unknown; mode?: "concept" | "hint"; userAnswer?: any }
    | null;

  const key = normalizeKey(body?.key);
  if (!key) return NextResponse.json({ message: "Missing key." }, { status: 400 });

  const actor0 = await getActor();
  const payload = verifyPracticeKey(key);
  if (!payload) return NextResponse.json({ message: "Invalid or expired key." }, { status: 401 });

  // adopt/ensure guest cookie like validate does
  let actor = actor0;
  let setGuestId: string | null = null;

  if (!actor0.userId && !actor0.guestId && (payload as any).guestId) {
    actor = { ...actor0, guestId: (payload as any).guestId };
    setGuestId = (payload as any).guestId;
  } else {
    const ensured = ensureGuestId(actor0);
    actor = ensured.actor;
    setGuestId = ensured.setGuestId ?? null;
  }

  // actor match (prevents key sharing)
  if (
    ((payload as any).userId && (payload as any).userId !== (actor.userId ?? null)) ||
    ((payload as any).guestId && (payload as any).guestId !== (actor.guestId ?? null))
  ) {
    const res = NextResponse.json({ message: "Actor mismatch." }, { status: 401 });
    return attachGuestCookie(res, setGuestId);
  }

  const instance = await prisma.practiceQuestionInstance.findUnique({
    where: { id: (payload as any).instanceId },
  });

  if (!instance) {
    const res = NextResponse.json({ message: "Instance not found." }, { status: 404 });
    return attachGuestCookie(res, setGuestId);
  }

  // load session if any (assignment gating + ownership)
  const sess = instance.sessionId
    ? await prisma.practiceSession.findUnique({
        where: { id: instance.sessionId },
        select: { assignmentId: true, userId: true, guestId: true },
      })
    : null;

  const isAssignment = Boolean(sess?.assignmentId);

  if (isAssignment) {
    const gate = await requireEntitledUser();
    if (!gate.ok) return gate.res;

    if (sess?.userId && sess.userId !== gate.userId) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }
  }

  if (
    (sess?.userId && sess.userId !== (actor.userId ?? null)) ||
    (sess?.guestId && sess.guestId !== (actor.guestId ?? null))
  ) {
    const res = NextResponse.json({ message: "Forbidden." }, { status: 403 });
    return attachGuestCookie(res, setGuestId);
  }

  const topic = await prisma.practiceTopic.findUnique({
    where: { id: instance.topicId },
    select: { slug: true },
  });

  const explanation = await explainPracticeConcept({
    mode: body?.mode ?? "concept",
    title: instance.title,
    prompt: instance.prompt,
    kind: instance.kind,
    topicSlug: topic?.slug ?? "unknown",
    userAnswer: body?.userAnswer ?? null,
  });

  const res = NextResponse.json({ explanation });
  return attachGuestCookie(res, setGuestId);
}
