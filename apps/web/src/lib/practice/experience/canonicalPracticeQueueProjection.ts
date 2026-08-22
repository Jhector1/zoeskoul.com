import type { PracticeSubscriberRunMeta } from "@/lib/practice/apiTypes";
import type { QItem } from "@/lib/practice/uiTypes";

type SelectedTarget = NonNullable<
  PracticeSubscriberRunMeta["selectedTargets"]
>[number];
type CompletedTarget =
  PracticeSubscriberRunMeta["completedPrefix"][number];

function targetIdentity(target: {
  topicSlug: string;
  exerciseKey: string;
}) {
  return `${String(target.topicSlug ?? "").trim()}|${String(
    target.exerciseKey ?? "",
  ).trim()}`;
}

function itemIdentity(item: QItem) {
  const exercise = item?.exercise as any;
  const topicSlug = String(
    exercise?.topicSlug ?? exercise?.topic ?? "",
  ).trim();
  const exerciseKey = String(
    exercise?.exerciseKey ?? exercise?.id ?? "",
  ).trim();
  return topicSlug && exerciseKey
    ? `${topicSlug}|${exerciseKey}`
    : null;
}

export type CanonicalPracticeQueueRow = {
  target: SelectedTarget;
  completed: CompletedTarget | null;
  item: QItem | null;
  sessionIndex: number;
  locked: boolean;
};

export function resolveCanonicalPracticeQueueRows(args: {
  selectedTargets:
    | PracticeSubscriberRunMeta["selectedTargets"]
    | null
    | undefined;
  completedPrefix:
    | PracticeSubscriberRunMeta["completedPrefix"]
    | null
    | undefined;
  allowedTargets?:
    | PracticeSubscriberRunMeta["allowedTargets"]
    | null
    | undefined;
  queueStack: QItem[];
}): CanonicalPracticeQueueRow[] {
  const selectedTargets = args.selectedTargets ?? [];
  if (selectedTargets.length === 0) return [];

  const completedByIdentity = new Map<string, CompletedTarget>();
  for (const target of args.completedPrefix ?? []) {
    completedByIdentity.set(targetIdentity(target), target);
  }

  const allowedIdentities =
    args.allowedTargets == null
      ? null
      : new Set(args.allowedTargets.map(targetIdentity));

  const stackByIdentity = new Map<
    string,
    { item: QItem; sessionIndex: number }
  >();
  args.queueStack.forEach((item, sessionIndex) => {
    const identity = itemIdentity(item);
    if (!identity || stackByIdentity.has(identity)) return;
    stackByIdentity.set(identity, { item, sessionIndex });
  });

  const rows = selectedTargets.map((target) => {
    const identity = targetIdentity(target);
    const stackMatch = stackByIdentity.get(identity);
    const completed = completedByIdentity.get(identity) ?? null;
    return {
      target,
      completed,
      item: stackMatch?.item ?? null,
      sessionIndex: stackMatch?.sessionIndex ?? -1,
      locked:
        completed == null &&
        allowedIdentities != null &&
        !allowedIdentities.has(identity),
    };
  });

  /**
   * Sidebar display only: stable-partition completed authored exercises first.
   * The canonical order inside each group is preserved, and each row retains its
   * original sessionIndex/item/lock so execution order and Daily allowance
   * membership never change.
   */
  return [
    ...rows.filter((row) => row.completed != null),
    ...rows.filter((row) => row.completed == null),
  ];
}
