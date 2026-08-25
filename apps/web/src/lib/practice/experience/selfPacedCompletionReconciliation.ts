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

/**
 * Materialize canonical completed inspection items into the browser navigation
 * stack without replacing newer browser state for an identity already loaded.
 *
 * This does not alter the server's remaining authored queue. It only makes
 * completed items addressable by the same idx/setIdx navigation primitive used
 * by the Practice shell.
 */
export function mergeSelfPacedCompletedHistoryStack(args: {
  stack: QItem[];
  completedItems: QItem[];
}) {
  if (!args.completedItems.length) return args.stack;

  const existingByIdentity = new Map<string, QItem>();
  for (const item of args.stack) {
    const identity = authoredPracticeItemIdentity(item);
    if (identity && !existingByIdentity.has(identity)) {
      existingByIdentity.set(identity, item);
    }
  }

  const completedIdentities = new Set<string>();
  const completedStack = args.completedItems.flatMap((historyItem) => {
    const identity = authoredPracticeItemIdentity(historyItem);
    if (!identity || completedIdentities.has(identity)) return [];

    completedIdentities.add(identity);
    return [existingByIdentity.get(identity) ?? historyItem];
  });

  const remaining = args.stack.filter((item) => {
    const identity = authoredPracticeItemIdentity(item);
    return !identity || !completedIdentities.has(identity);
  });

  const merged = [...completedStack, ...remaining];
  if (
    merged.length === args.stack.length &&
    merged.every((item, index) => item === args.stack[index])
  ) {
    return args.stack;
  }
  return merged;
}
