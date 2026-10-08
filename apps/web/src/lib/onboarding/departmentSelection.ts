import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Returns the learner departments that should personalize catalog discovery.
 *
 * `null` deliberately means "do not filter". Existing accounts, skipped
 * legacy onboarding, and incomplete profiles must keep seeing the full public
 * catalog until they have an explicit v2 learner department selection.
 *
 * This is personalization only. It must never be used as an authorization
 * boundary for assigned or directly-linked learning content.
 */
export async function getLearnerCatalogDepartmentFilter(
  userId: string,
): Promise<ReadonlySet<string> | null> {
  const profile = await prisma.userOnboardingProfile.findUnique({
    where: { userId },
    select: {
      version: true,
      useMode: true,
      completedAt: true,
      skippedAt: true,
      departments: {
        where: { context: "learner" },
        select: { departmentKey: true },
      },
    },
  });

  if (
    !profile ||
    profile.version < 2 ||
    !profile.completedAt ||
    profile.skippedAt ||
    profile.useMode === "teacher"
  ) {
    return null;
  }

  const departmentKeys = new Set<string>(
    profile.departments
      .map((item) => item.departmentKey.trim())
      .filter(Boolean),
  );

  return departmentKeys.size > 0 ? departmentKeys : null;
}
