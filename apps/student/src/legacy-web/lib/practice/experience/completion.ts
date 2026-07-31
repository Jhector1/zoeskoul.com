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
