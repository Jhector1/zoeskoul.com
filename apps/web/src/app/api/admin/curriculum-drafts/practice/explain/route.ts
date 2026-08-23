import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import {
  buildDraftQaInstance,
  loadDraftQaPracticeFromKey,
} from "@/lib/dev/curriculumDrafts/practiceQa";
import {
  explainPracticeConcept,
  explainPracticeTutor,
} from "@/lib/ai/explainPractice";
import { buildPracticeTutorDiagnosticContext } from "@/lib/ai/practiceTutorContext";
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

async function handlePOST(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid Draft QA tutor request.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const practice = await loadDraftQaPracticeFromKey(
      normalizeKey(parsed.data.key),
    );
    const instance = buildDraftQaInstance({
      exercise: practice.exercise,
      expected: practice.expected,
      topicSlug: practice.topicSlug,
    });

    const attemptsUsed = resolveAiTutorFailureCount({
      persistedFailures: 0,
      reportedFailures: parsed.data.failureContext?.attemptCount,
    });

    if (
      parsed.data.mode === "tutor" &&
      !hasReachedAiTutorFailureThreshold(attemptsUsed)
    ) {
      return NextResponse.json(
        {
          code: "AI_TUTOR_NOT_READY",
          message: "Tutor help is not available for this exercise yet.",
        },
        { status: 403 },
      );
    }

    if (parsed.data.mode === "tutor" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          code: "AI_TUTOR_UNAVAILABLE",
          message:
            "The AI tutor is unavailable right now. Use the authored hint instead.",
        },
        { status: 503 },
      );
    }

    let explanation: string;

    if (parsed.data.mode === "tutor") {
      const tutor = await explainPracticeTutor({
        diagnosticContext: buildPracticeTutorDiagnosticContext({
          title: instance.title,
          prompt: instance.prompt,
          kind: String(instance.kind),
          topicSlug: practice.topicSlug,
          publicPayload: practice.exercise,
          secretPayload: { expected: practice.expected },
          userAnswer: parsed.data.userAnswer ?? null,
          failureContext: {
            ...(parsed.data.failureContext ?? {}),
            attemptCount: attemptsUsed,
          },
          recentAttempts: [],
        }),
        message: parsed.data.message ?? null,
        history: parsed.data.history ?? [],
      });

      if (!tutor.providerResponded) {
        return NextResponse.json(
          {
            code: "AI_TUTOR_UNAVAILABLE",
            message:
              "The AI tutor could not respond right now. Use the authored hint instead.",
          },
          { status: 503 },
        );
      }

      explanation = tutor.explanation;
    } else {
      explanation = await explainPracticeConcept({
        mode: parsed.data.mode,
        title: instance.title,
        prompt: instance.prompt,
        kind: String(instance.kind),
        topicSlug: practice.topicSlug,
        userAnswer: parsed.data.userAnswer ?? null,
      });
    }

    return NextResponse.json({
      reply: explanation,
      explanation,
      attemptsUsed,
      draftQa: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Draft QA tutor request failed.",
      },
      { status: 400 },
    );
  }
}

export function POST(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    () => handlePOST(request),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
