import type { PracticeExperienceMode } from "./types";

/**
 * The page/surface that owns a practice runtime.
 *
 * A surface controls which product experiences it may render. The persisted
 * PracticeSession still owns the actual experience mode. This prevents a
 * query-string hint such as `type=assignment` from reclassifying a standard
 * subscriber session, while still letting the shared module-practice route
 * render both subscriber practice and assignments.
 */
export type PracticeRuntimeSurface =
  | "module_practice"
  | "daily_practice"
  | "trial_practice"
  | "lesson_review";

export type PracticeRuntimeSurfacePolicy = {
  surface: PracticeRuntimeSurface;
  defaultMode: PracticeExperienceMode;
  allowedModes: readonly PracticeExperienceMode[];
};

export type PracticeExperienceRuntimePolicy = {
  workspace: "embedded" | "tools";
  resumeFromServer: boolean;
};

const EXPERIENCE_POLICIES: Record<
  PracticeExperienceMode,
  PracticeExperienceRuntimePolicy
> = {
  practice: { workspace: "tools", resumeFromServer: false },
  standard: { workspace: "tools", resumeFromServer: true },
  daily_five: { workspace: "tools", resumeFromServer: false },
  onboarding_trial: { workspace: "embedded", resumeFromServer: false },
  public_challenge: { workspace: "tools", resumeFromServer: false },
  assignment: { workspace: "embedded", resumeFromServer: true },
};

const POLICIES: Record<PracticeRuntimeSurface, PracticeRuntimeSurfacePolicy> = {
  module_practice: {
    surface: "module_practice",
    defaultMode: "standard",
    allowedModes: ["practice", "standard", "assignment"],
  },
  daily_practice: {
    surface: "daily_practice",
    defaultMode: "daily_five",
    allowedModes: ["daily_five"],
  },
  trial_practice: {
    surface: "trial_practice",
    defaultMode: "onboarding_trial",
    allowedModes: ["onboarding_trial", "public_challenge"],
  },
  lesson_review: {
    surface: "lesson_review",
    defaultMode: "practice",
    allowedModes: ["practice"],
  },
};

export function getPracticeRuntimeSurfacePolicy(
  surface: PracticeRuntimeSurface,
): PracticeRuntimeSurfacePolicy {
  return POLICIES[surface];
}

export function isPracticeExperienceAllowedOnSurface(args: {
  surface: PracticeRuntimeSurface;
  mode: PracticeExperienceMode;
}) {
  return getPracticeRuntimeSurfacePolicy(args.surface).allowedModes.includes(
    args.mode,
  );
}


export function getPracticeExperienceRuntimePolicy(
  mode: PracticeExperienceMode,
): PracticeExperienceRuntimePolicy {
  return EXPERIENCE_POLICIES[mode];
}

export function shouldResumePracticeFromServer(mode: PracticeExperienceMode) {
  return getPracticeExperienceRuntimePolicy(mode).resumeFromServer;
}

/**
 * Resolve the mode used before/while run metadata is loading.
 *
 * Priority is deliberate:
 * 1. persisted run metadata (authoritative),
 * 2. server-provided initial mode,
 * 3. assignment URL hint (bootstrap compatibility only),
 * 4. surface default.
 */
export function resolvePracticeSurfaceMode(args: {
  surface: PracticeRuntimeSurface;
  runMode?: PracticeExperienceMode | null;
  initialMode?: PracticeExperienceMode | null;
  requestedAssignment?: boolean;
}): PracticeExperienceMode {
  const policy = getPracticeRuntimeSurfacePolicy(args.surface);

  if (args.runMode && policy.allowedModes.includes(args.runMode)) {
    return args.runMode;
  }

  if (args.initialMode && policy.allowedModes.includes(args.initialMode)) {
    return args.initialMode;
  }

  if (
    args.requestedAssignment &&
    policy.allowedModes.includes("assignment")
  ) {
    return "assignment";
  }

  return policy.defaultMode;
}
