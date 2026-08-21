import "server-only";

import {
  listPublishedPracticeExerciseOptions,
  type PublishedPracticeExerciseOption,
} from "@/lib/practice/challenges/publishedCatalog";
import {
  authoredPracticeTargetIdentity,
  type AuthoredPracticeTarget,
} from "./authoredPracticeQueue";
import {
  buildSubscriberPracticePlan,
  pickSubscriberPracticeQueue,
  type SubscriberPracticeHistoryItem,
  type SubscriberPracticeScope,
} from "./subscriberPractice";
import { loadSubscriberModulePracticeHistory } from "./subscriberPracticeSessions.server";

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function optionalSlug(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text !== "all" ? text : null;
}

function historyTime(item: SubscriberPracticeHistoryItem) {
  const raw = item.seenAt instanceof Date ? item.seenAt : new Date(item.seenAt);
  return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
}

function uniqueTargets(targets: readonly AuthoredPracticeTarget[]) {
  const result = new Map<string, AuthoredPracticeTarget>();
  for (const target of targets) {
    const identity = authoredPracticeTargetIdentity(target);
    if (!result.has(identity)) result.set(identity, target);
  }
  return [...result.values()];
}

export type SelfPacedPracticeState = {
  scope: SubscriberPracticeScope;
  practiceRunId: string;
  practiceRunStartedAt: string;
  selectedTargets: AuthoredPracticeTarget[];
  completedPrefix: Array<AuthoredPracticeTarget & { correct: boolean }>;
  queue: AuthoredPracticeTarget[];
  nextTarget: AuthoredPracticeTarget | null;
  targetCount: number;
  scopePoolTotal: number;
  complete: boolean;
};

export async function loadSelfPacedPracticeState(args: {
  userId: string;
  subjectSlug: string;
  moduleSlug: string;
  moduleId?: string | null;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount?: number | string | null;
  practiceRunId: string;
  practiceRunStartedAt: string;
  publishedOptions?: readonly PublishedPracticeExerciseOption[];
}): Promise<SelfPacedPracticeState> {
  const userId = String(args.userId ?? "").trim();
  const subjectSlug = String(args.subjectSlug ?? "").trim();
  const moduleSlug = String(args.moduleSlug ?? "").trim();
  const practiceRunId = String(args.practiceRunId ?? "").trim();
  const startedAt = new Date(String(args.practiceRunStartedAt ?? ""));

  if (!userId || !subjectSlug || !moduleSlug) {
    throw new Error(
      "Canonical self-paced Practice requires learner and module scope.",
    );
  }
  if (!practiceRunId || Number.isNaN(startedAt.getTime())) {
    throw new Error(
      "Canonical self-paced Practice requires a valid URL run identity.",
    );
  }

  const sectionSlug = optionalSlug(args.sectionSlug);
  const topicSlug = optionalSlug(args.topicSlug);
  const scope: SubscriberPracticeScope = {
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
  };

  const options =
    args.publishedOptions ?? (await listPublishedPracticeExerciseOptions());
  const fullHistory = await loadSubscriberModulePracticeHistory({
    userId,
    subjectSlug,
    moduleSlug,
    moduleId: args.moduleId,
    publishedOptions: options,
  });

  // Freeze selection against history that existed when this browser run was
  // started. Later completions from Header/Lesson can update completed state
  // without changing which capped exercises this run selected.
  const baselineHistory = fullHistory.filter(
    (item) => historyTime(item) <= startedAt.getTime(),
  );
  const requestedCount = positiveInt(args.targetCount);
  const scopePlan = buildSubscriberPracticePlan({
    options,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
    targetCount: null,
    history: baselineHistory,
    seed: practiceRunId,
  });

  const scopePoolTotal = scopePlan.moduleTotal;

  /**
   * Completion changes row status, never selected membership.
   *
   * Select from the full eligible scope, not only the remaining unfinished
   * pool. This keeps a Header/Lesson Practice list stable when an authored
   * exercise was already completed from the other entry origin.
   */
  const selectedTargets = uniqueTargets(
    pickSubscriberPracticeQueue({
      options,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicSlug,
      targetCount: requestedCount ?? scopePoolTotal,
      history: baselineHistory,
      seed: practiceRunId,
    }),
  );

  const latestCompletion = new Map<
    string,
    { at: number; correct: boolean }
  >();
  for (const item of fullHistory) {
    if (!item.completedAt) continue;
    const identity = authoredPracticeTargetIdentity({
      topicSlug: item.topicSlug,
      exerciseKey: item.exerciseKey,
    });
    const completedAt =
      item.completedAt instanceof Date
        ? item.completedAt
        : new Date(item.completedAt);
    const at = Number.isNaN(completedAt.getTime())
      ? historyTime(item)
      : completedAt.getTime();
    const current = latestCompletion.get(identity);
    if (!current || at > current.at) {
      latestCompletion.set(identity, {
        at,
        correct: item.lastOk === true,
      });
    }
  }

  const completedPrefix = selectedTargets.flatMap((target) => {
    const completed = latestCompletion.get(
      authoredPracticeTargetIdentity(target),
    );
    return completed ? [{ ...target, correct: completed.correct }] : [];
  });
  const completed = new Set(
    completedPrefix.map(authoredPracticeTargetIdentity),
  );
  const queue = selectedTargets.filter(
    (target) => !completed.has(authoredPracticeTargetIdentity(target)),
  );

  return {
    scope,
    practiceRunId,
    practiceRunStartedAt: startedAt.toISOString(),
    selectedTargets,
    completedPrefix,
    queue,
    nextTarget: queue[0] ?? null,
    targetCount: selectedTargets.length,
    scopePoolTotal,
    complete: selectedTargets.length === 0 || queue.length === 0,
  };
}
