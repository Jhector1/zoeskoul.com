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
  queueStack: QItem[];
}): CanonicalPracticeQueueRow[] {
  const selectedTargets = args.selectedTargets ?? [];
  if (selectedTargets.length === 0) return [];

  const completedByIdentity = new Map<string, CompletedTarget>();
  for (const target of args.completedPrefix ?? []) {
    completedByIdentity.set(targetIdentity(target), target);
  }

  const stackByIdentity = new Map<
    string,
    { item: QItem; sessionIndex: number }
  >();
  args.queueStack.forEach((item, sessionIndex) => {
    const identity = itemIdentity(item);
    if (!identity || stackByIdentity.has(identity)) return;
    stackByIdentity.set(identity, { item, sessionIndex });
  });

  return selectedTargets.map((target) => {
    const identity = targetIdentity(target);
    const stackMatch = stackByIdentity.get(identity);
    return {
      target,
      completed: completedByIdentity.get(identity) ?? null,
      item: stackMatch?.item ?? null,
      sessionIndex: stackMatch?.sessionIndex ?? -1,
    };
  });
}
