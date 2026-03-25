import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";

// async function getActor() {
//   const h = await headers();
//   const c = await cookies();

//   const userId = h.get("x-user-id") || undefined;
//   const guestId = c.get("guestId")?.value;

//   if (userId) return { userId };
//   if (guestId) return { guestId };
//   return null;
// }

function pickExpected(instance: any) {
  const sp = instance?.secretPayload ?? null;
  if (sp && typeof sp === "object" && "expected" in sp) return (sp as any).expected;
  return sp;
}

function pickExplanation(instance: any) {
  const sp = instance?.secretPayload ?? null;
  if (sp && typeof sp === "object" && "explanation" in sp) return (sp as any).explanation;
  return instance?.explanation ?? undefined;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json(
      { message: "Not authenticated (missing userId header or guestId cookie)" },
      { status: 401 }
    );
  }

  const { id } = await params;

  const session = await prisma.practiceSession.findFirst({
    where: {
      id,
      ...(actor.userId ? { userId: actor.userId } : { guestId: actor.guestId }),
    },
    include: {
      section: { select: { slug: true, title: true, description: true } },
      attempts: {
        orderBy: { createdAt: "asc" },
        include: {
          instance: {
            select: {
              id: true,
              title: true,
              prompt: true,
              kind: true,
              topic: true,
              difficulty: true,
              publicPayload: true,
              secretPayload: true,
            },
          },
        },
      },
    },
  });

  if (!session) return NextResponse.json({ message: "Session not found" }, { status: 404 });

  const byInstance = new Map<string, any[]>();
  for (const a of session.attempts) {
    const arr = byInstance.get(a.instanceId) ?? [];
    arr.push(a);
    byInstance.set(a.instanceId, arr);
  }

  const missed = Array.from(byInstance.entries())
    .map(([instanceId, attempts]) => {
      const last = attempts[attempts.length - 1];
      const inst = last.instance;
      if (last.ok) return null;

      return {
        instanceId,
        title: inst.title,
        prompt: inst.prompt,
        kind: inst.kind,
        topic: inst.topic,
        difficulty: inst.difficulty,
        expected: pickExpected(inst),
        yourAnswer: last.answerPayload,
        explanation: pickExplanation(inst),
        revealUsed: last.revealUsed,
        attemptedAt: last.createdAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      difficulty: session.difficulty,
      targetCount: session.targetCount,
      total: session.total,
      correct: session.correct,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      section: session.section,
    },
    missed,
  });
}
