
import "server-only";

import { prisma } from "@/lib/prisma";

import type { TeachingUser } from "./teachingAccess";
import {
  resolveLearningOrganizationAccessPolicy,
  type LearningOrganizationStaffRole,
} from "./schoolAccessPolicy";

export function learningOrganizationWhereForTeachingUser(
  teachingUser: TeachingUser,
) {
  if (teachingUser.isAdmin) {
    return {};
  }

  return {
    OR: [
      { ownerId: teachingUser.id },
      {
        memberships: {
          some: {
            userId: teachingUser.id,
          },
        },
      },
    ],
  };
}

export async function getLearningOrganizationAccess(args: {
  organizationId: string;
  teachingUser: TeachingUser;
}) {
  const organization = await prisma.learningOrganization.findUnique({
    where: { id: args.organizationId },
    include: {
      memberships: {
        where: { userId: args.teachingUser.id },
        select: { role: true },
        take: 1,
      },
      _count: {
        select: {
          groups: true,
          memberships: true,
        },
      },
    },
  });

  if (!organization) return null;

  const membershipRole =
    (organization.memberships[0]?.role ??
      null) as LearningOrganizationStaffRole | null;

  const access = resolveLearningOrganizationAccessPolicy({
    platformAdmin: args.teachingUser.isAdmin,
    owner: organization.ownerId === args.teachingUser.id,
    membershipRole,
  });

  if (!access.canAccessSchool) return null;

  return {
    organization,
    access,
    membershipRole,
  };
}

export async function canTeachingUserUseOrganizationForClass(args: {
  organizationId: string | null | undefined;
  teachingUser: TeachingUser;
}) {
  if (!args.organizationId) {
    return true;
  }

  const resolved =
    await getLearningOrganizationAccess({
      organizationId:
        args.organizationId,
      teachingUser:
        args.teachingUser,
    });

  return Boolean(
    resolved?.access.canCreateClasses,
  );
}
