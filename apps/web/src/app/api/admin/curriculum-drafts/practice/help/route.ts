import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import {
  buildDraftQaInstance,
  getDraftQaAuthoredHelpContent,
  loadDraftQaPracticeFromKey,
} from "@/lib/dev/curriculumDrafts/practiceQa";
import {
  getPracticeHelpStepDef,
  isRevealStepKey,
} from "@/lib/practice/help/steps";
import { buildRevealForInstance } from "@/lib/practice/api/help/reveal/buildRevealForInstance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.any(),
  stepKey: z.string().min(1),
  userAnswer: z.any().optional(),
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
        { message: "Invalid Draft QA help request.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const stepDef = getPracticeHelpStepDef(parsed.data.stepKey);
    if (!stepDef) {
      return NextResponse.json(
        { message: "Unknown help step." },
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

    if (isRevealStepKey(parsed.data.stepKey)) {
      const revealed = await buildRevealForInstance({
        instance,
        expectedCanon: practice.expected,
        showDebug: true,
      });

      return NextResponse.json({
        stepKey: parsed.data.stepKey,
        step: stepDef,
        source: "system",
        content: revealed.explanation ?? null,
        reveal: revealed.revealAnswer,
        finalized: true,
        sessionComplete: false,
        draftQa: true,
      });
    }

    const content =
      getDraftQaAuthoredHelpContent(
        practice.exercise,
        parsed.data.stepKey,
      ) ??
      (typeof (practice.exercise as any).hint === "string"
        ? String((practice.exercise as any).hint)
        : null);

    return NextResponse.json({
      stepKey: parsed.data.stepKey,
      step: stepDef,
      source: "authored",
      content,
      reveal: null,
      finalized: false,
      sessionComplete: false,
      draftQa: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Draft QA help failed.",
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
