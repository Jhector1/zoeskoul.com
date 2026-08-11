import { NextResponse } from "next/server";

import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import {
  buildDraftQaInstance,
  loadDraftQaPracticeFromKey,
} from "@/lib/dev/curriculumDrafts/practiceQa";
import { BodySchema, normalizeKey } from "@/lib/practice/api/validate/schemas";
import { gradeInstance } from "@/lib/practice/api/validate/grade";
import { buildRevealForInstance } from "@/lib/practice/api/help/reveal/buildRevealForInstance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Invalid Draft QA validation request.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const key = normalizeKey(parsed.data.key);
    const practice = await loadDraftQaPracticeFromKey(key);
    const instance = buildDraftQaInstance({
      exercise: practice.exercise,
      expected: practice.expected,
      topicSlug: practice.topicSlug,
    });

    if (parsed.data.reveal) {
      const revealed = await buildRevealForInstance({
        instance,
        expectedCanon: practice.expected,
        showDebug: true,
      });

      return NextResponse.json({
        ok: false,
        revealUsed: true,
        revealAnswer: revealed.revealAnswer,
        expected: null,
        explanation: revealed.explanation,
        feedback: null,
        finalized: true,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        summary: null,
        gamification: null,
        draftQa: true,
      });
    }

    const answer = parsed.data.answer ?? null;

    if (!answer || String((answer as any).kind) !== String((practice.exercise as any).kind)) {
      return NextResponse.json(
        { message: "Answer kind does not match the draft exercise." },
        { status: 400 },
      );
    }

    const graded = await gradeInstance({
      instance,
      expectedCanon: practice.expected,
      answer,
      showDebug: true,
    });

    if (graded.infrastructureFailure) {
      const failure = graded.infrastructureFailure;
      return NextResponse.json(
        {
          message: failure.message,
          code: failure.code,
          explanation: null,
          feedback: null,
          finalized: false,
          draftQa: true,
        },
        { status: failure.status },
      );
    }

    return NextResponse.json({
      ok: Boolean(graded.ok),
      revealUsed: false,
      revealAnswer: null,
      expected: null,
      explanation: graded.explanation ?? null,
      feedback: graded.feedback ?? null,
      finalized: Boolean(graded.ok),
      duplicate: false,
      attempts: null,
      sessionComplete: false,
      summary: null,
      gamification: null,
      draftQa: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Draft QA validation failed.",
      },
      { status: 400 },
    );
  }
}
