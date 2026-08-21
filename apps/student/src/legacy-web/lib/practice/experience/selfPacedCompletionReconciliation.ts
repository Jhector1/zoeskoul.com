import type { PracticeSubscriberRunMeta } from "@/lib/practice/apiTypes";
import type { QItem } from "@/lib/practice/uiTypes";

function authoredPracticeItemIdentity(item: QItem) {
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

/**
 * Reconcile a restored browser queue with canonical self-paced completion.
 *
 * The browser run owns only presentation/workspace state. Completion belongs
 * to learner + module + canonical authored exercise in the database, so a
 * refresh must project newer canonical completion back onto rows that were
 * already materialized in this run without changing their order/workspace.
 */
export function reconcileSelfPacedCompletionStack(args: {
  stack: QItem[];
  completedPrefix:
    | PracticeSubscriberRunMeta["completedPrefix"]
    | null
    | undefined;
}) {
  const completed = new Map<string, boolean>();

  for (const target of args.completedPrefix ?? []) {
    const topicSlug = String(target.topicSlug ?? "").trim();
    const exerciseKey = String(target.exerciseKey ?? "").trim();
    if (!topicSlug || !exerciseKey) continue;
    completed.set(
      `${topicSlug}|${exerciseKey}`,
      target.correct === true,
    );
  }

  if (completed.size === 0) return args.stack;

  let changed = false;
  const next = args.stack.map((item) => {
    const identity = authoredPracticeItemIdentity(item);
    if (!identity || !completed.has(identity)) return item;

    const correct = completed.get(identity) === true;
    const result = item.result as any;

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
    };
  });

  return changed ? next : args.stack;
}
