import type { PracticeChooserSelection } from "./practiceChooserTypes";
import { buildModulePracticeHref } from "./modulePracticeHref";

export function buildSubscriberPracticeHref(args: {
  locale?: string | null;
  selection: PracticeChooserSelection;
  targetCount: number;
  sessionId?: string | null;
}) {
  return buildModulePracticeHref({
    locale: args.locale,
    subjectSlug: args.selection.subjectSlug,
    moduleSlug: args.selection.moduleSlug,
    sessionId: args.sessionId,
    mode: "standard",
    sectionSlug: args.selection.sectionSlug,
    topicSlug: args.selection.topicSlug,
    questionCount: args.targetCount,
    preferPurpose: "mixed",
    purposePolicy: "fallback",
  });
}
