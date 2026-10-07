import type { QItem } from "@zoeskoul/practice-contracts";

export type CanonicalPracticeTarget = {
  exerciseKey: string;
  exerciseTitle?: string;
  exerciseKind?: string;
  topicSlug: string;
  sectionSlug?: string;
};

export type CanonicalPracticeCompletedTarget =
  CanonicalPracticeTarget & {
    correct?: boolean;
  };

function targetIdentity(target: {
  topicSlug: string;
  exerciseKey: string;
}) {
  return `${String(
    target.topicSlug ?? "",
  ).trim()}|${String(
    target.exerciseKey ?? "",
  ).trim()}`;
}

function itemIdentity(item: QItem) {
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

export type CanonicalPracticeQueueRow<
  TTarget extends CanonicalPracticeTarget =
    CanonicalPracticeTarget,
  TCompleted extends
    CanonicalPracticeCompletedTarget =
      CanonicalPracticeCompletedTarget,
  TItem extends QItem = QItem,
> = {
  target: TTarget;
  completed: TCompleted | null;
  item: TItem | null;
  sessionIndex: number;
  locked: boolean;
};

export function resolveCanonicalPracticeQueueRows<
  TTarget extends CanonicalPracticeTarget,
  TCompleted extends CanonicalPracticeCompletedTarget,
  TItem extends QItem,
>(args: {
  selectedTargets:
    | readonly TTarget[]
    | null
    | undefined;
  completedPrefix:
    | readonly TCompleted[]
    | null
    | undefined;
  allowedTargets?:
    | readonly TTarget[]
    | null
    | undefined;
  queueStack: readonly TItem[];
}): Array<
  CanonicalPracticeQueueRow<
    TTarget,
    TCompleted,
    TItem
  >
> {
  const selectedTargets =
    args.selectedTargets ?? [];

  if (selectedTargets.length === 0) {
    return [];
  }

  const completedByIdentity =
    new Map<string, TCompleted>();

  for (
    const target of args.completedPrefix ?? []
  ) {
    completedByIdentity.set(
      targetIdentity(target),
      target,
    );
  }

  const allowedIdentities =
    args.allowedTargets == null
      ? null
      : new Set(
          args.allowedTargets.map(
            targetIdentity,
          ),
        );

  const stackByIdentity = new Map<
    string,
    {
      item: TItem;
      sessionIndex: number;
    }
  >();

  args.queueStack.forEach(
    (item, sessionIndex) => {
      const identity = itemIdentity(item);

      if (
        !identity ||
        stackByIdentity.has(identity)
      ) {
        return;
      }

      stackByIdentity.set(identity, {
        item,
        sessionIndex,
      });
    },
  );

  const rows = selectedTargets.map(
    (target) => {
      const identity =
        targetIdentity(target);

      const stackMatch =
        stackByIdentity.get(identity);

      const completed =
        completedByIdentity.get(identity) ??
        null;

      return {
        target,
        completed,
        item: stackMatch?.item ?? null,
        sessionIndex:
          stackMatch?.sessionIndex ?? -1,
        locked:
          completed == null &&
          allowedIdentities != null &&
          !allowedIdentities.has(identity),
      };
    },
  );

  /**
   * Sidebar display only: stable-partition completed authored exercises first.
   * Canonical order inside each group is preserved. sessionIndex/item/lock
   * continue to describe execution order and Daily allowance membership.
   */
  return [
    ...rows.filter(
      (row) => row.completed != null,
    ),
    ...rows.filter(
      (row) => row.completed == null,
    ),
  ];
}
