import type {
  PracticeChooserSelection,
  SubscriberPracticeSessionSummary,
} from "./practiceChooserTypes";

export function samePracticeSelection(
  left: PracticeChooserSelection | null | undefined,
  right: PracticeChooserSelection | null | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.subjectSlug === right.subjectSlug &&
      left.moduleSlug === right.moduleSlug &&
      left.sectionSlug === right.sectionSlug &&
      left.topicSlug === right.topicSlug,
  );
}

export function findActiveSubscriberPracticeSession(
  sessions: readonly SubscriberPracticeSessionSummary[],
  selection: PracticeChooserSelection,
) {
  return (
    sessions.find((session) =>
      samePracticeSelection(session.selection, selection),
    ) ?? null
  );
}
