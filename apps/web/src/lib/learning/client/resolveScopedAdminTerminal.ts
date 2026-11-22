import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import {
  parseStudentAdminLabTarget,
  STUDENT_ADMIN_COURSE_SLUG,
  type StudentAdminLabTarget,
} from "@/lib/learning/server/learningAdminStudentPolicy";

/** Presentation choice only. Web routes and the Runner must independently authorize every start. */
export type ScopedAdminTerminalSelection =
  | { kind: "ordinary" }
  | { kind: "student"; target: StudentAdminLabTarget }
  | { kind: "draft"; draft: { catalog: "linux"; subject: "linux"; module: string; topic: string } };

export function resolveScopedAdminTerminal(args: {
  subjectSlug: string;
  moduleSlug: string;
  topicSlug: string;
  ideConfig?: LearningIdeConfig | null;
  draftQaMode: boolean;
  draftSelection?: { catalog: string; subject: string; module: string; topic: string } | null;
}): ScopedAdminTerminalSelection {
  // This exact allowlist is shared with the server-side student policy. Never
  // treat inherited manifest metadata alone as permission to start root.
  const target = parseStudentAdminLabTarget({
    moduleSlug: args.moduleSlug, topicSlug: args.topicSlug,
  });
  if (!target) return { kind: "ordinary" };

  if (args.draftQaMode) {
    const draft = args.draftSelection;
    if (draft?.catalog !== "linux" || draft.subject !== "linux" ||
        draft.module !== args.moduleSlug || draft.topic !== args.topicSlug) {
      return { kind: "ordinary" };
    }
    return {kind: "draft", draft: {
      catalog: "linux", subject: "linux", module: draft.module, topic: draft.topic,
    }};
  }

  if (args.subjectSlug !== STUDENT_ADMIN_COURSE_SLUG ||
      args.ideConfig?.administratorLab !== "eligible") {
    return { kind: "ordinary" };
  }
  return {kind: "student", target};
}
