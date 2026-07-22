// src/app/api/practice/explain/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";
import { attachGuestCookie, ensureGuestId, getActor } from "@/lib/practice/actor";
import { verifyPracticeKey } from "@/lib/practice/key";
import {
  explainPracticeConcept,
  explainPracticeTutor,
} from "@/lib/ai/explainPractice";
import { rateLimit } from "@/lib/security/ratelimit";
import { buildPracticeTutorDiagnosticContext } from "@/lib/ai/practiceTutorContext";
import {
  getClientIp,
  hardenApiResponse,
} from "@/lib/practice/api/shared/http";
import { assertSessionOwnerMatchesActor } from "@/lib/practice/api/shared/sessionAccess";
import {
  hasReachedAiTutorFailureThreshold,
  resolveAiTutorFailureCount,
} from "@/lib/practice/aiTutorPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1600),
});

const BodySchema = z.object({
  key: z.any(),
  mode: z.enum(["concept", "hint", "tutor"]).default("concept"),
  userAnswer: z.any().optional(),
  failureContext: z.record(z.string(), z.unknown()).optional(),
  message: z.string().trim().max(1600).optional(),
  history: z.array(ConversationMessageSchema).max(8).optional(),
});

function normalizeKey(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const value = input as any;
    if (typeof value.token === "string") return value.token;
    if (typeof value.key === "string") return value.key;
    if (typeof value.value === "string") return value.value;
  }
  return null;
}

function withRequestId(res: NextResponse, requestId: string) {
  res.headers.set("X-Request-Id", requestId);
  return res;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return hardenApiResponse(
      withRequestId(
        NextResponse.json(
          {
            message: "Invalid request body.",
            issues: parsed.error.issues,
            requestId,
          },
          { status: 400 },
        ),
        requestId,
      ),
    );
  }

  const key = normalizeKey(parsed.data.key);
  if (!key) {
    return hardenApiResponse(
      withRequestId(
        NextResponse.json({ message: "Missing key.", requestId }, { status: 400 }),
        requestId,
      ),
    );
  }

  const actor0 = await getActor();
  const payload = verifyPracticeKey(key);
  if (!payload) {
    return hardenApiResponse(
      withRequestId(
        NextResponse.json(
          { message: "Invalid or expired key.", requestId },
          { status: 401 },
        ),
        requestId,
      ),
    );
  }

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

  if (
    ((payload as any).userId && (payload as any).userId !== (actor.userId ?? null)) ||
    ((payload as any).guestId && (payload as any).guestId !== (actor.guestId ?? null))
  ) {
    const res = NextResponse.json(
      { message: "Actor mismatch.", requestId },
      { status: 401 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  const ip = getClientIp(req);
  const rate = await rateLimit(
    `practice-explain:${ip}:${(payload as any).instanceId}`,
  ).catch(() => null);

  if (rate && !rate.ok) {
    const res = NextResponse.json(
      { message: "Too many requests.", requestId },
      { status: 429 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  const instance = await prisma.practiceQuestionInstance.findUnique({
    where: { id: (payload as any).instanceId },
    include: {
      topic: { select: { slug: true } },
      session: {
        include: {
          assignment: { select: { id: true } },
          preset: { select: { id: true } },
        },
      },
    },
  });

  if (!instance) {
    const res = NextResponse.json(
      { message: "Instance not found.", requestId },
      { status: 404 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  try {
    assertSessionOwnerMatchesActor(instance.session, actor);
  } catch (error: any) {
    const res = NextResponse.json(
      {
        message: error?.message ?? "Forbidden.",
        code: error?.code ?? "SESSION_OWNER_MISMATCH",
        requestId,
      },
      { status: Number(error?.status) || 403 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  const experienceMode = resolvePracticeExperienceMode(instance.session);
  if (experienceMode === "assignment" && !actor.userId) {
    const res = NextResponse.json(
      { message: "Sign in to use assignment help.", requestId },
      { status: 401 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  let attemptsUsed = 0;
  let recentAttempts: Array<{
    answerPayload: unknown;
    ok: boolean;
    createdAt: Date;
  }> = [];

  if (parsed.data.mode === "tutor") {
    const ownerWhere = actor.userId
      ? { userId: actor.userId }
      : { guestId: actor.guestId as string };
    const attemptWhere = {
      instanceId: instance.id,
      ok: false,
      revealUsed: false,
      ...ownerWhere,
    };

    [attemptsUsed, recentAttempts] = await Promise.all([
      prisma.practiceAttempt.count({ where: attemptWhere }),
      prisma.practiceAttempt.findMany({
        where: attemptWhere,
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { answerPayload: true, ok: true, createdAt: true },
      }),
    ]);
  }

  if (parsed.data.mode === "tutor") {
    attemptsUsed = resolveAiTutorFailureCount({
      persistedFailures: attemptsUsed,
      reportedFailures: parsed.data.failureContext?.attemptCount,
    });
  }

  if (
    parsed.data.mode === "tutor" &&
    !hasReachedAiTutorFailureThreshold(attemptsUsed)
  ) {
    const res = NextResponse.json(
      {
        code: "AI_TUTOR_NOT_READY",
        message: "Tutor help is not available for this exercise yet.",
        requestId,
      },
      { status: 403 },
    );
    return attachGuestCookie(
      hardenApiResponse(withRequestId(res, requestId)),
      setGuestId,
    );
  }

  const explanation =
    parsed.data.mode === "tutor"
      ? await explainPracticeTutor({
          diagnosticContext: buildPracticeTutorDiagnosticContext({
            title: instance.title,
            prompt: instance.prompt,
            kind: String(instance.kind),
            topicSlug: instance.topic?.slug ?? "unknown",
            publicPayload: instance.publicPayload,
            secretPayload: instance.secretPayload,
            userAnswer: parsed.data.userAnswer ?? null,
            failureContext: {
              ...(parsed.data.failureContext ?? {}),
              attemptCount: attemptsUsed,
            },
            recentAttempts: recentAttempts.map((attempt) => ({
              ok: attempt.ok,
              answer: attempt.answerPayload,
              createdAt: attempt.createdAt.toISOString(),
            })),
          }),
          message: parsed.data.message ?? null,
          history: parsed.data.history ?? [],
        })
      : await explainPracticeConcept({
          mode: parsed.data.mode,
          title: instance.title,
          prompt: instance.prompt,
          kind: instance.kind,
          topicSlug: instance.topic?.slug ?? "unknown",
          userAnswer: parsed.data.userAnswer ?? null,
        });

  const res = NextResponse.json({
    requestId,
    explanation,
    reply: explanation,
    attemptsUsed,
  });
  return attachGuestCookie(
    hardenApiResponse(withRequestId(res, requestId)),
    setGuestId,
  );
}
