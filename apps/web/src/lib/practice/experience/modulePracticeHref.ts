import type { PracticeExperienceMode } from "./types";

type ModulePracticeMode = Extract<
  PracticeExperienceMode,
  "practice" | "standard" | "assignment"
>;

export function buildModulePracticeHref(args: {
  locale?: string | null;
  subjectSlug: string;
  moduleSlug: string;
  sessionId?: string | null;
  practiceRunId?: string | null;
  practiceRunStartedAt?: string | null;
  mode: ModulePracticeMode;
  returnTo?: string | null;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  questionCount?: number | null;
  preferPurpose?: "quiz" | "project" | "practice" | "mixed" | null;
  purposePolicy?: "strict" | "fallback" | null;
}) {
  const query = new URLSearchParams();

  if (args.sessionId) query.set("sessionId", args.sessionId);
  if (args.practiceRunId) query.set("practiceRunId", args.practiceRunId);
  if (args.practiceRunStartedAt) {
    query.set("practiceRunStartedAt", args.practiceRunStartedAt);
  }
  if (args.mode === "practice") query.set("mode", "practice");
  if (args.mode === "assignment") query.set("type", "assignment");
  if (args.returnTo) query.set("returnTo", args.returnTo);
  if (args.sectionSlug) query.set("section", args.sectionSlug);
  if (args.topicSlug) query.set("topic", args.topicSlug);
  if (args.questionCount && args.questionCount > 0) {
    query.set("questionCount", String(args.questionCount));
  }
  if (args.preferPurpose) query.set("preferPurpose", args.preferPurpose);
  if (args.purposePolicy) query.set("purposePolicy", args.purposePolicy);

  const queryString = query.toString();
  const path =
    `/subjects/${encodeURIComponent(args.subjectSlug)}` +
    `/modules/${encodeURIComponent(args.moduleSlug)}` +
    `/practice${queryString ? `?${queryString}` : ""}`;

  const locale = String(args.locale ?? "").trim();
  return locale ? `/${encodeURIComponent(locale)}${path}` : path;
}
