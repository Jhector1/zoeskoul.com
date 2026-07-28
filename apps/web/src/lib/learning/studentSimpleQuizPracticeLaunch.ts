import "server-only";

import type {
  LearningPracticeExercise,
  LearningPracticeLaunchResponse,
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { buildPracticeGetContext } from "@/lib/practice/api/get/context";
import { handlePracticeGet } from "@/lib/practice/api/get/handler";
import { GetParamsSchema } from "@/lib/practice/api/get/schemas";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import { resolveTaggedOnServer } from "@/i18n/server";
import type {
  ReviewModule,
} from "@/lib/subjects/types";

import {
  isStudentSimpleQuizKind,
  resolveStudentSimpleQuizDescriptor,
} from "./studentSimpleQuizPracticeDescriptor";

import {
  projectStudentPracticeExercise,
} from "./studentPracticeExerciseData";

export type StudentSimpleQuizPracticeLaunchResult =
  | {
      kind: "ready";
      response: LearningPracticeLaunchResponse;
    }
  | {
      kind: "unsupported";
      reason:
        | "not_quiz_target"
        | "quiz_card_not_found"
        | "requires_exact_single_exercise"
        | "manifest_exercise_not_found"
        | "exercise_kind_not_migrated";
    }
  | {
      kind: "error";
      status: number;
      body: unknown;
    };

async function responsePayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function runRecord(
  value: unknown,
): Record<string, unknown> | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function jsonRecord(
  value: unknown,
): Record<string, unknown> | null {
  return runRecord(value);
}

export async function buildStudentSimpleQuizPracticeLaunch(
  args: {
    request: Request;
    actor: Actor;
    locale: string;
    subjectSlug: string;
    moduleSlug: string;
    reviewModule: ReviewModule;
    target: LearningRuntimeTarget;
  },
): Promise<StudentSimpleQuizPracticeLaunchResult> {
  const descriptor =
    resolveStudentSimpleQuizDescriptor({
      reviewModule: args.reviewModule,
      target: args.target,
    });

  if (!descriptor) {
    return {
      kind: "unsupported",
      reason:
        args.target.runtimeKind === "quiz"
          ? "requires_exact_single_exercise"
          : "not_quiz_target",
    };
  }

  let authored: unknown;

  try {
    const topicBundle =
      resolveTopicBundleManifest({
        subjectSlug: args.subjectSlug,
        topicSlugOrId:
          descriptor.topicSlug,
      });

    if (!topicBundle) {
      return {
        kind: "unsupported",
        reason:
          "manifest_exercise_not_found",
      };
    }

    authored = resolveManifestExercise({
      topicBundle,
      exerciseKey:
        descriptor.exerciseKey,
    });
  } catch {
    return {
      kind: "unsupported",
      reason:
        "manifest_exercise_not_found",
    };
  }

  const authoredRecord =
    jsonRecord(authored);
  const authoredKind =
    authoredRecord?.kind;

  if (
    !isStudentSimpleQuizKind(
      authoredKind,
    )
  ) {
    return {
      kind: "unsupported",
      reason:
        "exercise_kind_not_migrated",
    };
  }

  const parsed = GetParamsSchema.safeParse({
    subject: args.subjectSlug,
    module: args.moduleSlug,
    section: args.target.sectionSlug,
    topic: descriptor.topicSlug,
    difficulty: descriptor.difficulty,
    allowReveal: "false",
    preferKind: authoredKind,
    preferPurpose: "quiz",
    purposePolicy: "strict",
    exerciseKey:
      descriptor.exerciseKey,
    seedPolicy: "global",
    salt:
      `student-runtime|${args.subjectSlug}` +
      `|${args.moduleSlug}` +
      `|${args.target.topicSlug}` +
      `|${args.target.ownerCardId}` +
      `|${descriptor.exerciseKey}`,
  });

  if (!parsed.success) {
    return {
      kind: "error",
      status: 500,
      body: {
        error:
          "Invalid server-authored practice launch parameters",
        issues: parsed.error.issues,
      },
    };
  }

  const context =
    await buildPracticeGetContext({
      prisma,
      actor: args.actor,
      params: parsed.data,
      locale: args.locale,
      safeReturnUrl: null,
      safeReturnTo: null,
    });

  const access =
    await resolvePracticeAccess({
      prisma,
      actor: args.actor,
      locale: args.locale,
      req: args.request,
      params: {
        subject:
          context.params.subject ??
          null,
        module:
          context.params.module ??
          null,
        sessionId: null,
        returnUrl: null,
        returnTo: null,
      },
      session: null,
    });

  if (!access.ok) {
    return {
      kind: "error",
      status: access.res.status,
      body: await responsePayload(
        access.res,
      ),
    };
  }

  const generated =
    await handlePracticeGet(context);

  if (generated.kind === "res") {
    return {
      kind: "error",
      status: generated.res.status,
      body: await responsePayload(
        generated.res,
      ),
    };
  }

  if (generated.status !== 200) {
    return {
      kind: "error",
      status: generated.status,
      body: generated.body,
    };
  }

  const body = jsonRecord(generated.body);
  const key =
    typeof body?.key === "string"
      ? body.key
      : "";
  const rawExercise =
    body?.exercise;

  if (!key || !rawExercise) {
    return {
      kind: "error",
      status: 500,
      body: {
        error:
          "Practice generation returned an invalid launch payload",
      },
    };
  }

  /**
   * Project first so secret grading fields never reach the translation layer.
   * The server resolver then replaces learner-visible @: tags recursively.
   */
  const projectedExercise =
    projectStudentPracticeExercise(
      rawExercise,
    );
  const exercise =
    await resolveTaggedOnServer(
      projectedExercise,
    ) as LearningPracticeExercise;

  if (
    !isStudentSimpleQuizKind(
      exercise.kind,
    )
  ) {
    return {
      kind: "error",
      status: 500,
      body: {
        error:
          "Practice generation changed the authored exercise kind",
      },
    };
  }

  return {
    kind: "ready",
    response: {
      target: args.target,
      title:
        exercise.title ||
        descriptor.card.title?.trim() ||
        null,
      exercise,
      key,
      sessionId:
        typeof body?.sessionId ===
          "string"
          ? body.sessionId
          : null,
      run: runRecord(body?.run),
      validationPath:
        "/api/student/runtime/practice/validate",
    },
  };
}
