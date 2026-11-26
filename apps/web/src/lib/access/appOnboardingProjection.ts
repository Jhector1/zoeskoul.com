import type { AppOnboardingState } from "@zoeskoul/api-contracts";

/** The same projection is used for cookie and Redis-authorized sessions. */
export const appOnboardingProfileSelect = {
  version: true,
  completedAt: true,
  skippedAt: true,
  departments: { select: { departmentKey: true, context: true } },
} as const;

type OnboardingProfile = {
  version: number;
  completedAt: Date | null;
  skippedAt: Date | null;
  departments: readonly { departmentKey: string; context: "learner" | "teacher" }[];
};

export function projectAppOnboarding(profile: OnboardingProfile | null): AppOnboardingState {
  if (!profile) {
    return { status: "not_started", version: 1, learnerDepartments: [], teacherDepartments: [] };
  }
  return {
    status: profile.completedAt || profile.skippedAt ? "completed" : "in_progress",
    version: Math.max(1, profile.version),
    learnerDepartments: profile.departments.filter((item) => item.context === "learner")
      .map((item) => item.departmentKey).sort(),
    teacherDepartments: profile.departments.filter((item) => item.context === "teacher")
      .map((item) => item.departmentKey).sort(),
  };
}
