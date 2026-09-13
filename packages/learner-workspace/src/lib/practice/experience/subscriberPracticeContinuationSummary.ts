import type {
  PracticeChooserSelection,
  SubscriberPracticeContinuationSummary,
} from "./practiceChooserTypes";

/**
 * Normal Practice continuation identity is module-only.
 * Section/topic are authored exercise metadata, never progress namespaces.
 */
export function samePracticeModuleSelection(
  left: PracticeChooserSelection | null | undefined,
  right: PracticeChooserSelection | null | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.subjectSlug === right.subjectSlug &&
      left.moduleSlug === right.moduleSlug,
  );
}

export function findSubscriberPracticeContinuation(
  continuations: readonly SubscriberPracticeContinuationSummary[],
  selection: PracticeChooserSelection,
) {
  return (
    continuations.find((continuation) =>
      samePracticeModuleSelection(continuation.selection, selection),
    ) ?? null
  );
}
