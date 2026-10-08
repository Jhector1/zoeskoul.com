import "server-only";

import { cache } from "react";

import type { AppOnboardingState } from "@zoeskoul/api-contracts";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveRoleCapabilities,
  type RoleCapabilities,
} from "@/lib/access/roleCapabilities";

export type CurrentUserAccess = {
  authenticated: boolean;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  } | null;
  capabilities: RoleCapabilities;
  onboarding: AppOnboardingState | null;
};

const EMPTY_CAPABILITIES = resolveRoleCapabilities([]);

/**
 * Resolves the authenticated user against Prisma on every request.
 *
 * The session establishes identity only. Database roles are the sole source
 * of authorization and are intentionally not inferred from email addresses
 * or environment variables.
 */
export const getCurrentUserAccess = cache(
  async (): Promise<CurrentUserAccess> => {
    const session = await auth();
    const userId = session?.user?.id?.trim() || null;
    const email = session?.user?.email?.trim().toLowerCase() || null;

    if (!userId && !email) {
      return {
        authenticated: false,
        user: null,
        capabilities: EMPTY_CAPABILITIES,
        onboarding: null,
      };
    }

    // Email is only a compatibility fallback for sessions issued before uid
    // was added. It identifies a database row; it never grants privileges.
    const user = await prisma.user.findFirst({
      where: userId ? { id: userId } : { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        roles: true,
        onboardingProfile: {
          select: {
            version: true,
            completedAt: true,
            skippedAt: true,
            departments: {
              select: {
                departmentKey: true,
                context: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return {
        authenticated: false,
        user: null,
        capabilities: EMPTY_CAPABILITIES,
        onboarding: null,
      };
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      capabilities: resolveRoleCapabilities(user.roles),
      onboarding: user.onboardingProfile
        ? {
            status:
              user.onboardingProfile.completedAt ||
              user.onboardingProfile.skippedAt
                ? "completed"
                : "in_progress",
            version: Math.max(1, user.onboardingProfile.version),
            learnerDepartments: user.onboardingProfile.departments
              .filter((item) => item.context === "learner")
              .map((item) => item.departmentKey)
              .sort(),
            teacherDepartments: user.onboardingProfile.departments
              .filter((item) => item.context === "teacher")
              .map((item) => item.departmentKey)
              .sort(),
          }
        : {
            status: "not_started",
            version: 1,
            learnerDepartments: [],
            teacherDepartments: [],
          },
    };
  },
);
