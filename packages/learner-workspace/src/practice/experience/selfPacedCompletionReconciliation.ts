import type { QItem } from "@zoeskoul/practice-contracts";
import type { CanonicalPracticeCompletedTarget } from "./canonicalPracticeQueueProjection";

export type SelfPacedCompletedTarget = CanonicalPracticeCompletedTarget;

function authoredPracticeItemIdentity(
  item: QItem,
) {
  const exercise = item.exercise as Record<
    string,
    unknown
  >;

  const topicSlug = String(
    exercise.topicSlug ?? exercise.topic ?? "",
  ).trim();

  const exerciseKey = String(
    exercise.exerciseKey ?? exercise.id ?? "",
  ).trim();

  return topicSlug && exerciseKey
    ? `${topicSlug}|${exerciseKey}`
    : null;
}

/**
 * Reconcile a restored browser queue with canonical self-paced completion.
 *
 * Browser state owns presentation/workspace only. Canonical completion belongs
 * to learner + module + authored exercise, so restored rows receive newer
 * canonical completion without changing order/workspace.
 */
export function reconcileSelfPacedCompletionStack<
  TItem extends QItem,
>(args: {
  stack: TItem[];
  completedPrefix:
    | readonly SelfPacedCompletedTarget[]
    | null
    | undefined;
}): TItem[] {
  const completed =
    new Map<string, boolean>();

  for (
    const target of args.completedPrefix ?? []
  ) {
    const topicSlug = String(
      target.topicSlug ?? "",
    ).trim();

    const exerciseKey = String(
      target.exerciseKey ?? "",
    ).trim();

    if (!topicSlug || !exerciseKey) {
      continue;
    }

    completed.set(
      `${topicSlug}|${exerciseKey}`,
      target.correct === true,
    );
  }

  if (completed.size === 0) {
    return args.stack;
  }

  let changed = false;

  const next = args.stack.map((item) => {
    const identity =
      authoredPracticeItemIdentity(item);

    if (
      !identity ||
      !completed.has(identity)
    ) {
      return item;
    }

    const correct =
      completed.get(identity) === true;

    const result =
      item.result as
        | Record<string, unknown>
        | null;

    if (
      item.submitted === true &&
      result?.finalized === true &&
      result?.ok === correct
    ) {
      return item;
    }

    changed = true;

    return {
      ...item,
      submitted: true,
      result: {
        ...(result ?? {}),
        ok: correct,
        finalized: true,
      },
    } as TItem;
  });

  return changed ? next : args.stack;
}

/**
 * Materialize canonical completed inspection items into browser navigation
 * without replacing newer browser state for an identity already loaded.
 */
export function mergeSelfPacedCompletedHistoryStack<
  TItem extends QItem,
>(args: {
  stack: TItem[];
  completedItems: TItem[];
}): TItem[] {
  if (!args.completedItems.length) {
    return args.stack;
  }

  const existingByIdentity =
    new Map<string, TItem>();

  for (const item of args.stack) {
    const identity =
      authoredPracticeItemIdentity(item);

    if (
      identity &&
      !existingByIdentity.has(identity)
    ) {
      existingByIdentity.set(
        identity,
        item,
      );
    }
  }

  const completedIdentities =
    new Set<string>();

  const completedStack =
    args.completedItems.flatMap(
      (historyItem) => {
        const identity =
          authoredPracticeItemIdentity(
            historyItem,
          );

        if (
          !identity ||
          completedIdentities.has(
            identity,
          )
        ) {
          return [];
        }

        completedIdentities.add(identity);

        return [
          existingByIdentity.get(identity) ??
            historyItem,
        ];
      },
    );

  const remaining =
    args.stack.filter((item) => {
      const identity =
        authoredPracticeItemIdentity(item);

      return (
        !identity ||
        !completedIdentities.has(identity)
      );
    });

  const merged = [
    ...completedStack,
    ...remaining,
  ];

  if (
    merged.length === args.stack.length &&
    merged.every(
      (item, index) =>
        item === args.stack[index],
    )
  ) {
    return args.stack;
  }

  return merged;
}
