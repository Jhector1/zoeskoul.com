import "server-only";

import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";

export type SharedChallengePurpose = "quiz" | "project";

export type SharedChallengeTargetInput = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exercisePurpose?: SharedChallengePurpose;
};

export type ResolvedSharedChallengeTarget = Omit<
  SharedChallengeTargetInput,
  "exercisePurpose"
> & {
  exerciseTitle: string;
  exerciseKind: string;
  exercisePurpose: SharedChallengePurpose;
};

function required(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function readableExerciseTitle(
  exercise: Record<string, unknown>,
  fallback: string,
) {
  const title = typeof exercise.title === "string" ? exercise.title.trim() : "";
  if (title && !title.startsWith("@:")) return title;

  const titleKey =
    typeof exercise.titleKey === "string" ? exercise.titleKey.trim() : "";
  if (titleKey) {
    const parts = titleKey.split(".").filter(Boolean);
    const candidate = parts.at(-1) === "title" ? parts.at(-2) : parts.at(-1);
    if (candidate) return candidate.replace(/[-_]+/g, " ");
  }

  const messageBase =
    typeof exercise.messageBase === "string" ? exercise.messageBase.trim() : "";
  if (messageBase) {
    const candidate = messageBase.split(".").filter(Boolean).at(-1);
    if (candidate) return candidate.replace(/[-_]+/g, " ");
  }

  return fallback.replace(/[-_]+/g, " ");
}

function resolvePurpose(
  exercise: Record<string, unknown>,
): SharedChallengePurpose {
  const purpose = String(exercise.purpose ?? "").trim();

  if (purpose === "quiz" || purpose === "project") {
    return purpose;
  }

  throw new Error(
    `Only quiz and project exercises can be shared publicly. This exercise uses purpose "${purpose || "unknown"}".`,
  );
}

function requiresAuthenticatedPtyRunner(args: {
  exercise: Record<string, unknown>;
  topicBundle: Record<string, unknown>;
}) {
  if (String(args.exercise.kind ?? "") !== "code_input") return false;

  const exerciseIde =
    args.exercise.ideConfig && typeof args.exercise.ideConfig === "object"
      ? (args.exercise.ideConfig as Record<string, unknown>)
      : null;
  const serviceDefaults =
    args.topicBundle.serviceDefaults &&
    typeof args.topicBundle.serviceDefaults === "object"
      ? (args.topicBundle.serviceDefaults as Record<string, unknown>)
      : null;
  const runtimeDefaults =
    args.topicBundle.runtimeDefaults &&
    typeof args.topicBundle.runtimeDefaults === "object"
      ? (args.topicBundle.runtimeDefaults as Record<string, unknown>)
      : null;
  const recipe =
    args.exercise.recipe && typeof args.exercise.recipe === "object"
      ? (args.exercise.recipe as Record<string, unknown>)
      : null;
  const requires =
    exerciseIde?.requires && typeof exerciseIde.requires === "object"
      ? (exerciseIde.requires as Record<string, unknown>)
      : null;

  const runnerBackend = String(
    exerciseIde?.runnerBackend ?? serviceDefaults?.runnerBackend ?? "",
  ).trim();
  const recipeType = String(recipe?.type ?? "").trim();
  const runtimeLanguage = String(runtimeDefaults?.language ?? "").trim();
  const terminalRequired =
    requires?.terminal === true || runtimeDefaults?.supportsTerminal === true;

  return (
    runnerBackend === "pty" ||
    recipeType === "shell_task" ||
    (runtimeLanguage === "bash" && terminalRequired)
  );
}

export function resolveSharedChallengeTarget(
  input: SharedChallengeTargetInput,
): ResolvedSharedChallengeTarget {
  const requested = {
    subjectSlug: required(input.subjectSlug, "subjectSlug"),
    moduleSlug: required(input.moduleSlug, "moduleSlug"),
    sectionSlug: required(input.sectionSlug, "sectionSlug"),
    topicSlug: required(input.topicSlug, "topicSlug"),
    exerciseKey: required(input.exerciseKey, "exerciseKey"),
  };

  const topicBundle = resolveTopicBundleManifest({
    subjectSlug: requested.subjectSlug,
    topicSlugOrId: requested.topicSlug,
  });

  if (!topicBundle) {
    throw new Error(
      `Published topic "${requested.topicSlug}" was not found for subject "${requested.subjectSlug}". Run Gen manifests before creating the link.`,
    );
  }

  const bundleRecord = topicBundle as unknown as Record<string, unknown>;
  const bundleModuleSlug = String(bundleRecord.moduleSlug ?? "").trim();
  if (bundleModuleSlug && bundleModuleSlug !== requested.moduleSlug) {
    throw new Error(
      `Exercise belongs to module "${bundleModuleSlug}", not "${requested.moduleSlug}".`,
    );
  }

  const bundleSectionSlug = String(bundleRecord.sectionSlug ?? "").trim();
  if (bundleSectionSlug && bundleSectionSlug !== requested.sectionSlug) {
    throw new Error(
      `Exercise belongs to section "${bundleSectionSlug}", not "${requested.sectionSlug}".`,
    );
  }

  const exercise = resolveManifestExercise({
    topicBundle,
    exerciseKey: requested.exerciseKey,
  }) as Record<string, unknown>;

  const purpose = resolvePurpose(exercise);
  if (input.exercisePurpose && input.exercisePurpose !== purpose) {
    throw new Error(
      `This challenge link expected a ${input.exercisePurpose} exercise, but the published exercise is now ${purpose}. Create a new link.`,
    );
  }

  if (
    requiresAuthenticatedPtyRunner({
      exercise,
      topicBundle: bundleRecord,
    })
  ) {
    throw new Error(
      `"${requested.exerciseKey}" requires an authenticated terminal runner and cannot be used as an anonymous public challenge yet.`,
    );
  }

  const topicSlug = String(topicBundle.topicId ?? requested.topicSlug).trim();

  return {
    subjectSlug: requested.subjectSlug,
    moduleSlug: bundleModuleSlug || requested.moduleSlug,
    sectionSlug: bundleSectionSlug || requested.sectionSlug,
    topicSlug,
    exerciseKey: requested.exerciseKey,
    exerciseTitle: readableExerciseTitle(exercise, requested.exerciseKey),
    exerciseKind: String(exercise.kind ?? "unknown"),
    exercisePurpose: purpose,
  };
}
