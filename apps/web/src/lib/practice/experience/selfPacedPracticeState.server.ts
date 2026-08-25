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
  type SubscriberPracticeHistoryItem,
  type SubscriberPracticeScope,
} from "./subscriberPractice";
import { loadSubscriberModulePracticeHistory } from "./subscriberPracticeSessions.server";
import type { SessionHistoryRow } from "@/lib/practice/runtime/types";

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
  completedHistory: SessionHistoryRow[];
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

  const scope: SubscriberPracticeScope = {
    subjectSlug,
    moduleSlug,
    sectionSlug: null,
    topicSlug: null,
  };

  const options =
    args.publishedOptions ?? (await listPublishedPracticeExerciseOptions());
  const fullHistory = await loadSubscriberModulePracticeHistory({
    userId,
    subjectSlug,
    moduleSlug,
    moduleId: args.moduleId,
    publishedOptions: options,
    includeReview: true,
  });

  // Browser-run ordering may be frozen against start-time history, but
  // membership is always the complete authored Practice pool for this module.
  const baselineHistory = fullHistory.filter(
    (item) => historyTime(item) <= startedAt.getTime(),
  );
  const scopePlan = buildSubscriberPracticePlan({
    options,
    subjectSlug,
    moduleSlug,
    sectionSlug: null,
    topicSlug: null,
    targetCount: null,
    history: baselineHistory,
    seed: practiceRunId,
  });

  const selectedTargets = uniqueTargets([
    ...scopePlan.completedPrefix,
    ...scopePlan.queue,
  ]);

  const latestCompletion = new Map<
    string,
    { at: number; correct: boolean; review: SessionHistoryRow | null }
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
        review: item.review ?? null,
      });
    }
  }

  const completedPrefix = selectedTargets.flatMap((target) => {
    const completed = latestCompletion.get(
      authoredPracticeTargetIdentity(target),
    );
    return completed ? [{ ...target, correct: completed.correct }] : [];
  });
  const completedHistory = selectedTargets.flatMap((target) => {
    const completion = latestCompletion.get(
      authoredPracticeTargetIdentity(target),
    );
    return completion?.review ? [completion.review] : [];
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
    completedHistory,
    queue,
    nextTarget: queue[0] ?? null,
    targetCount: selectedTargets.length,
    scopePoolTotal: scopePlan.moduleTotal,
    complete: selectedTargets.length === 0 || queue.length === 0,
  };
}
