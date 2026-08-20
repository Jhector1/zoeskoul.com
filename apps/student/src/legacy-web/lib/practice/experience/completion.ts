import type {
  PracticeExperienceMode,
  PracticeRunViewer,
} from "@/lib/practice/experience/types";

export type PracticeCompletionIntent =
  | "daily_free"
  | "daily_subscriber"
  | "challenge_guest"
  | "challenge_member"
  | "trial"
  | "assignment"
  | "standard";

export const MODULE_PRACTICE_RETURN_LABEL = "Return to lesson";

export function isLessonPracticeReturnUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return false;

  try {
    const url = new URL(raw, "https://zoeskoul.local");
    if (url.origin !== "https://zoeskoul.local") return false;

    const segments = url.pathname.split("/").filter(Boolean);
    const subjectsIndex = segments.indexOf("subjects");
    return (
      subjectsIndex >= 1 &&
      Boolean(segments[subjectsIndex + 1]) &&
      segments[subjectsIndex + 2] === "modules" &&
      Boolean(segments[subjectsIndex + 3]) &&
      segments[subjectsIndex + 4] === "learn"
    );
  } catch {
    return false;
  }
}

export function shouldReturnToLessonAfterModulePractice(args: {
  mode: PracticeExperienceMode;
  returnUrl?: string | null;
}) {
  if (args.mode !== "standard") return false;

  return isLessonPracticeReturnUrl(args.returnUrl);
}

export function resolvePracticeCompletionIntent(args: {
  mode: PracticeExperienceMode;
  viewer: PracticeRunViewer;
}): PracticeCompletionIntent {
  if (args.mode === "daily_five") {
    return args.viewer.subscribed ? "daily_subscriber" : "daily_free";
  }

  if (args.mode === "public_challenge") {
    return args.viewer.authenticated ? "challenge_member" : "challenge_guest";
  }

  if (args.mode === "onboarding_trial") return "trial";
  if (args.mode === "assignment") return "assignment";
  return "standard";
}

export function nextUtcDayStartIso(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

export function countdownParts(targetIso: string | null | undefined, now = Date.now()) {
  const target = targetIso ? new Date(targetIso).getTime() : Number.NaN;
  const remainingMs = Number.isFinite(target) ? Math.max(0, target - now) : 0;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    remainingMs,
    ready: remainingMs <= 0,
    hours,
    minutes,
    seconds,
  };
}
