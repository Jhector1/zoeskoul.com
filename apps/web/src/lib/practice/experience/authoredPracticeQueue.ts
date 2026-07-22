import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

export type AuthoredPracticePurpose = "quiz" | "project";

export type AuthoredPracticeTarget = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exerciseTitle: string;
  exerciseKind: string;
  exercisePurpose: AuthoredPracticePurpose;
};

type UsedAuthoredPracticeTarget = {
  exerciseKey?: string | null;
  topic?: { slug?: string | null } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeAuthoredPracticePurpose(
  purpose: PublishedPracticeExerciseOption["exercisePurpose"] | unknown,
): AuthoredPracticePurpose {
  return purpose === "quiz" ? "quiz" : "project";
}

export function authoredPracticeTargetFromOption(
  option: PublishedPracticeExerciseOption,
): AuthoredPracticeTarget {
  return {
    subjectSlug: option.subjectSlug,
    moduleSlug: option.moduleSlug,
    sectionSlug: option.sectionSlug,
    topicSlug: option.topicSlug,
    exerciseKey: option.exerciseKey,
    exerciseTitle: option.exerciseTitle,
    exerciseKind: option.exerciseKind,
    exercisePurpose: normalizeAuthoredPracticePurpose(option.exercisePurpose),
  };
}

export function authoredPracticeTargetIdentity(
  target: Pick<AuthoredPracticeTarget, "topicSlug" | "exerciseKey">,
) {
  return `${target.topicSlug}|${target.exerciseKey}`;
}

export function normalizeAuthoredPracticeQueue(
  value: unknown,
): AuthoredPracticeTarget[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item) => ({
      subjectSlug: String(item!.subjectSlug ?? "").trim(),
      moduleSlug: String(item!.moduleSlug ?? "").trim(),
      sectionSlug: String(item!.sectionSlug ?? "").trim(),
      topicSlug: String(item!.topicSlug ?? "").trim(),
      exerciseKey: String(item!.exerciseKey ?? "").trim(),
      exerciseTitle: String(
        item!.exerciseTitle ?? item!.exerciseKey ?? "Practice",
      ).trim(),
      exerciseKind: String(item!.exerciseKind ?? "code_input").trim(),
      exercisePurpose: normalizeAuthoredPracticePurpose(
        item!.exercisePurpose,
      ),
    }))
    .filter(
      (item) =>
        item.subjectSlug &&
        item.moduleSlug &&
        item.sectionSlug &&
        item.topicSlug &&
        item.exerciseKey,
    );
}

export function resolveNextAuthoredPracticeTarget(args: {
  queue: readonly AuthoredPracticeTarget[];
  usedTargets: readonly UsedAuthoredPracticeTarget[];
}) {
  const usedIdentities = new Set(
    args.usedTargets
      .map((item) => {
        const exerciseKey = String(item.exerciseKey ?? "").trim();
        const topicSlug = String(item.topic?.slug ?? "").trim();
        return exerciseKey && topicSlug ? `${topicSlug}|${exerciseKey}` : "";
      })
      .filter(Boolean),
  );
  const usedKeysWithoutTopic = new Set(
    args.usedTargets
      .filter((item) => !String(item.topic?.slug ?? "").trim())
      .map((item) => String(item.exerciseKey ?? "").trim())
      .filter(Boolean),
  );

  return (
    args.queue.find((target) => {
      const identity = authoredPracticeTargetIdentity(target);
      return (
        !usedIdentities.has(identity) &&
        !usedKeysWithoutTopic.has(target.exerciseKey)
      );
    }) ?? null
  );
}

export function applyAuthoredPracticeTarget(args: {
  params: GetParams;
  target: AuthoredPracticeTarget;
  salt: string;
  allowReveal?: boolean;
}): GetParams {
  return {
    ...args.params,
    subject: args.target.subjectSlug,
    module: args.target.moduleSlug,
    section: args.target.sectionSlug,
    topic: args.target.topicSlug,
    exerciseKey: args.target.exerciseKey,
    preferPurpose: args.target.exercisePurpose,
    purposePolicy: "strict",
    seedPolicy: "global",
    salt: args.salt,
    allowReveal: args.allowReveal === false ? "false" : "true",
  };
}
