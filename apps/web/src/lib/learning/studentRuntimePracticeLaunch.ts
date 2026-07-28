import "server-only";

import type {
  LearningPracticeExercise,
  LearningPracticeLaunchResponse,
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import { resolveTaggedOnServer } from "@/i18n/server";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import { prisma } from "@/lib/prisma";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { buildPracticeGetContext } from "@/lib/practice/api/get/context";
import { handlePracticeGet } from "@/lib/practice/api/get/handler";
import { GetParamsSchema } from "@/lib/practice/api/get/schemas";
import type { Actor } from "@/lib/practice/actor";
import type { ReviewModule } from "@/lib/subjects/types";

import {
  resolveStudentEmbeddedTryItDescriptor,
} from "./studentEmbeddedTryItPracticeDescriptor";
import {
  isEligibleStudentEmbeddedPythonTryIt,
  isProjectedStudentEmbeddedPythonTryIt,
} from "./studentEmbeddedTryItEligibility";
import {
  projectStudentPracticeExercise,
} from "./studentPracticeExerciseData";
import {
  isStudentSimpleQuizKind,
  resolveStudentSimpleQuizDescriptor,
} from "./studentSimpleQuizPracticeDescriptor";
import {
  asJsonRecord,
  runtimeString,
} from "./studentRuntimePracticeDescriptorShared";

type RuntimeDescriptor = {
  mode: "simple_quiz" | "embedded_try_it";
  exerciseKey: string;
  topicSlug: string;
  difficulty: "easy" | "medium" | "hard";
  title: string | null;
};

export type StudentRuntimePracticeLaunchResult =
  | {
      kind: "ready";
      response: LearningPracticeLaunchResponse;
    }
  | {
      kind: "unsupported";
      reason:
        | "runtime_target_not_migrated"
        | "requires_exact_single_exercise"
        | "embedded_try_it_not_found"
        | "manifest_exercise_not_found"
        | "exercise_kind_not_migrated"
        | "embedded_try_it_shape_not_migrated";
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
  return asJsonRecord(value);
}

function resolveDescriptor(args: {
  reviewModule: ReviewModule;
  target: LearningRuntimeTarget;
}): RuntimeDescriptor | null {
  const simple = resolveStudentSimpleQuizDescriptor(args);

  if (simple) {
    return {
      mode: "simple_quiz",
      exerciseKey: simple.exerciseKey,
      topicSlug: simple.topicSlug,
      difficulty: simple.difficulty,
      title: simple.card.title?.trim() || null,
    };
  }

  const embedded =
    resolveStudentEmbeddedTryItDescriptor(args);

  if (embedded) {
    return {
      mode: "embedded_try_it",
      exerciseKey: embedded.exerciseKey,
      topicSlug: embedded.topicSlug,
      difficulty: embedded.difficulty,
      title: embedded.title,
    };
  }

  return null;
}

function unsupportedDescriptorReason(
  target: LearningRuntimeTarget,
): Extract<
  StudentRuntimePracticeLaunchResult,
  { kind: "unsupported" }
>["reason"] {
  if (
    target.targetKind === "card" &&
    target.runtimeKind === "quiz"
  ) {
    return "requires_exact_single_exercise";
  }

  if (
    target.targetKind === "embedded_try_it" &&
    target.runtimeKind === "try_it"
  ) {
    return "embedded_try_it_not_found";
  }

  return "runtime_target_not_migrated";
}

export async function buildStudentRuntimePracticeLaunch(
  args: {
    request: Request;
    actor: Actor;
    locale: string;
    subjectSlug: string;
    moduleSlug: string;
    reviewModule: ReviewModule;
    target: LearningRuntimeTarget;
  },
): Promise<StudentRuntimePracticeLaunchResult> {
  const descriptor = resolveDescriptor({
    reviewModule: args.reviewModule,
    target: args.target,
  });

  if (!descriptor) {
    return {
      kind: "unsupported",
      reason: unsupportedDescriptorReason(args.target),
    };
  }

  let authored: unknown;

  try {
    const topicBundle = resolveTopicBundleManifest({
      subjectSlug: args.subjectSlug,
      topicSlugOrId: descriptor.topicSlug,
    });

    if (!topicBundle) {
      return {
        kind: "unsupported",
        reason: "manifest_exercise_not_found",
      };
    }

    authored = resolveManifestExercise({
      topicBundle,
      exerciseKey: descriptor.exerciseKey,
    });
  } catch {
    return {
      kind: "unsupported",
      reason: "manifest_exercise_not_found",
    };
  }

  const authoredRecord = asJsonRecord(authored);
  const authoredKind = runtimeString(
    authoredRecord?.kind,
  );

  if (descriptor.mode === "simple_quiz") {
    if (!isStudentSimpleQuizKind(authoredKind)) {
      return {
        kind: "unsupported",
        reason: "exercise_kind_not_migrated",
      };
    }
  } else if (
    !isEligibleStudentEmbeddedPythonTryIt(authored)
  ) {
    return {
      kind: "unsupported",
      reason: "embedded_try_it_shape_not_migrated",
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
    preferPurpose:
      descriptor.mode === "embedded_try_it"
        ? "project"
        : "quiz",
    purposePolicy: "strict",
    exerciseKey: descriptor.exerciseKey,
    seedPolicy: "global",
    salt:
      `student-runtime|${args.subjectSlug}` +
      `|${args.moduleSlug}` +
      `|${args.target.topicSlug}` +
      `|${args.target.ownerCardId}` +
      `|${args.target.targetId}` +
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

  const context = await buildPracticeGetContext({
    prisma,
    actor: args.actor,
    params: parsed.data,
    locale: args.locale,
    safeReturnUrl: null,
    safeReturnTo: null,
  });

  const access = await resolvePracticeAccess({
    prisma,
    actor: args.actor,
    locale: args.locale,
    req: args.request,
    params: {
      subject: context.params.subject ?? null,
      module: context.params.module ?? null,
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
      body: await responsePayload(access.res),
    };
  }

  const generated = await handlePracticeGet(context);

  if (generated.kind === "res") {
    return {
      kind: "error",
      status: generated.res.status,
      body: await responsePayload(generated.res),
    };
  }

  if (generated.status !== 200) {
    return {
      kind: "error",
      status: generated.status,
      body: generated.body,
    };
  }

  const body = asJsonRecord(generated.body);
  const key = runtimeString(body?.key);
  const rawExercise = body?.exercise;

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

  const projectedExercise =
    projectStudentPracticeExercise(rawExercise);
  const exercise = await resolveTaggedOnServer(
    projectedExercise,
  ) as LearningPracticeExercise;

  const identityMatches =
    exercise.id === descriptor.exerciseKey ||
    exercise.exerciseKey === descriptor.exerciseKey;
  const shapeMatches =
    descriptor.mode === "simple_quiz"
      ? isStudentSimpleQuizKind(exercise.kind)
      : isProjectedStudentEmbeddedPythonTryIt(exercise);

  if (!identityMatches || !shapeMatches) {
    return {
      kind: "error",
      status: 500,
      body: {
        error:
          "Practice generation changed the authored exercise identity or shape",
      },
    };
  }

  return {
    kind: "ready",
    response: {
      target: args.target,
      title: exercise.title || descriptor.title,
      exercise,
      key,
      sessionId:
        typeof body?.sessionId === "string"
          ? body.sessionId
          : null,
      run: runRecord(body?.run),
      validationPath:
        "/api/student/runtime/practice/validate",
    },
  };
}
