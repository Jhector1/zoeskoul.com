import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

export type AuthoredPracticeEligibilityOption = Omit<
  PublishedPracticeExerciseOption,
  "releaseStatus"
>;

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
  option: AuthoredPracticeEligibilityOption,
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

function collectPracticeHistoryStrings(
  values: readonly unknown[],
) {
  const result = new Set<string>();

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) result.add(normalized);
  }

  return result;
}

function authoredPracticeHistoryKeyMatches(
  authoredExerciseKey: string,
  historyKey: string,
) {
  return (
    historyKey === authoredExerciseKey ||
    historyKey.endsWith(`:${authoredExerciseKey}`)
  );
}

/**
 * Resolve any persisted Practice instance back to the current canonical
 * authored target. This is the single identity rule used by module history,
 * completed-prefix progress, and next-target dedupe across every entry origin.
 *
 * Legacy/runtime-scoped keys are accepted only when they resolve uniquely
 * inside the current authored candidate pool. We never guess an ambiguous
 * key-only match across topics.
 */
export function resolveAuthoredPracticeHistoryTarget(args: {
  item: UsedAuthoredPracticeTarget;
  candidates: readonly AuthoredPracticeTarget[];
}): AuthoredPracticeTarget | null {
  const payload = asRecord(args.item.publicPayload);
  const payloadExercise = asRecord(payload?.exercise);

  const keyCandidates = collectPracticeHistoryStrings([
    payload?.exerciseKey,
    payload?.id,
    payloadExercise?.exerciseKey,
    payloadExercise?.id,
    args.item.exerciseKey,
  ]);
  if (!keyCandidates.size) return null;

  const topicCandidates = collectPracticeHistoryStrings([
    args.item.topic?.slug,
    payload?.topicSlug,
    payload?.topic,
    payloadExercise?.topicSlug,
    payloadExercise?.topic,
  ]);

  const keyMatches = args.candidates.filter((candidate) =>
    [...keyCandidates].some((historyKey) =>
      authoredPracticeHistoryKeyMatches(
        candidate.exerciseKey,
        historyKey,
      ),
    ),
  );

  if (!keyMatches.length) return null;

  if (topicCandidates.size) {
    const exactTopicMatches = keyMatches.filter((candidate) =>
      topicCandidates.has(candidate.topicSlug),
    );
    if (exactTopicMatches.length === 1) return exactTopicMatches[0];
  }

  return keyMatches.length === 1 ? keyMatches[0] : null;
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

export function selfPacedPracticeExperienceOwnerPrefix(args: {
  userId: string;
  moduleSlug: string;
}) {
  const userId = String(args.userId ?? "").trim();
  const moduleSlug = String(args.moduleSlug ?? "").trim();
  if (!userId || !moduleSlug) return "";
  return (
    `self-paced:user:${encodeURIComponent(userId)}:` +
    `module:${encodeURIComponent(moduleSlug)}:`
  );
}

export function selfPacedPracticeExperienceItemKey(args: {
  userId: string;
  moduleSlug: string;
  topicSlug: string;
  exerciseKey: string;
}) {
  const prefix = selfPacedPracticeExperienceOwnerPrefix(args);
  const topicSlug = String(args.topicSlug ?? "").trim();
  const exerciseKey = String(args.exerciseKey ?? "").trim();
  if (!prefix || !topicSlug || !exerciseKey) return null;
  return (
    `${prefix}` +
    `topic:${encodeURIComponent(topicSlug)}:` +
    `exercise:${encodeURIComponent(exerciseKey)}`
  );
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
      .map((item) =>
        resolveAuthoredPracticeHistoryTarget({
          item,
          candidates: args.queue,
        }),
      )
      .filter((target): target is AuthoredPracticeTarget => Boolean(target))
      .map(authoredPracticeTargetIdentity),
  );

  return (
    args.queue.find(
      (target) =>
        !usedIdentities.has(authoredPracticeTargetIdentity(target)),
    ) ?? null
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
