import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

export type AuthoredPracticePurpose = "quiz" | "project" | "practice";

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

export function isAuthoredLessonPracticeOption(
  option: PublishedPracticeExerciseOption,
) {
  return (
    option.sectionRole === "lesson" &&
    option.exercisePurpose === "practice"
  );
}

type UsedAuthoredPracticeTarget = {
  exerciseKey?: string | null;
  publicPayload?: unknown;
  topic?: { slug?: string | null } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function authoredPracticeHistoryExerciseKey(args: {
  exerciseKey?: string | null;
  publicPayload?: unknown;
}) {
  const payload = asRecord(args.publicPayload);
  const authoredId = String(payload?.id ?? "").trim();
  return authoredId || String(args.exerciseKey ?? "").trim();
}

export function normalizeAuthoredPracticePurpose(
  purpose: PublishedPracticeExerciseOption["exercisePurpose"] | unknown,
): AuthoredPracticePurpose {
  if (purpose === "quiz") return "quiz";
  if (purpose === "practice") return "practice";
  return "project";
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

export function stableAuthoredPracticeSelectionScore(
  seed: string,
  key: string,
) {
  let hash = 2166136261;
  const input = `${seed}|${key}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function uniquePublishedPracticeOptions(
  options: readonly PublishedPracticeExerciseOption[],
) {
  const unique = new Map<string, PublishedPracticeExerciseOption>();

  for (const option of options) {
    const identity = authoredPracticeTargetIdentity(
      authoredPracticeTargetFromOption(option),
    );
    if (!unique.has(identity)) unique.set(identity, option);
  }

  return [...unique.values()];
}

export function deterministicPublishedPracticeOrder(
  seed: string,
  options: readonly PublishedPracticeExerciseOption[],
) {
  return [...options].sort((left, right) => {
    const leftIdentity = authoredPracticeTargetIdentity(
      authoredPracticeTargetFromOption(left),
    );
    const rightIdentity = authoredPracticeTargetIdentity(
      authoredPracticeTargetFromOption(right),
    );

    return (
      stableAuthoredPracticeSelectionScore(seed, leftIdentity).localeCompare(
        stableAuthoredPracticeSelectionScore(seed, rightIdentity),
      ) || leftIdentity.localeCompare(rightIdentity)
    );
  });
}

export function roundRobinPracticeGroups<T>(
  groups: readonly { rows: readonly T[] }[],
  targetCount: number,
) {
  const selected: T[] = [];
  let round = 0;

  while (selected.length < targetCount) {
    let added = false;

    for (const group of groups) {
      const row = group.rows[round];
      if (row === undefined) continue;
      selected.push(row);
      added = true;
      if (selected.length >= targetCount) break;
    }

    if (!added) break;
    round += 1;
  }

  return selected;
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
        const exerciseKey = authoredPracticeHistoryExerciseKey(item);
        const topicSlug = String(item.topic?.slug ?? "").trim();
        return exerciseKey && topicSlug ? `${topicSlug}|${exerciseKey}` : "";
      })
      .filter(Boolean),
  );
  const usedKeysWithoutTopic = new Set(
    args.usedTargets
      .filter((item) => !String(item.topic?.slug ?? "").trim())
      .map((item) => authoredPracticeHistoryExerciseKey(item))
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
