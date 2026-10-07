import "server-only";

import type { TeachingUser } from "./teachingAccess";

/**
 * Canonical Teacher-side class visibility.
 *
 * A user account is global, but class access is scoped:
 * - platform admins may support every class;
 * - a class owner may access their own class;
 * - an institution owner/admin may access every class in that institution;
 * - an instructor may access only classes where they are explicitly assigned
 *   as a LearningGroup instructor;
 * - for institution classes, an assigned instructor must also belong to that
 *   same institution;
 * - student membership never grants Teacher-side class access.
 *
 * The predicate deliberately returns AND:[{OR:[...]}] instead of a top-level
 * OR so callers can compose it beside lifecycle/audience OR conditions
 * without one OR overwriting the other.
 */
export function learningGroupWhereForTeachingUser(
  teachingUser: TeachingUser,
) {
  if (teachingUser.isAdmin) {
    return {};
  }

  const userId = teachingUser.id;
  const organizationAdminRole = "admin" as const;
  const organizationInstructorRole = "instructor" as const;
  const groupInstructorRole = "instructor" as const;

  return {
    AND: [
      {
        OR: [
          {
            AND: [
              { ownerId: userId },
              { organizationId: null },
            ],
          },
          {
            AND: [
              { ownerId: userId },
              {
                organization: {
                  is: {
                    memberships: {
                      some: { userId },
                    },
                  },
                },
              },
            ],
          },
          {
            organization: {
              is: { ownerId: userId },
            },
          },
          {
            organization: {
              is: {
                memberships: {
                  some: {
                    userId,
                    role: organizationAdminRole,
                  },
                },
              },
            },
          },
          {
            AND: [
              {
                members: {
                  some: {
                    userId,
                    role: groupInstructorRole,
                  },
                },
              },
              {
                OR: [
                  { organizationId: null },
                  {
                    organization: {
                      is: {
                        memberships: {
                          some: {
                            userId,
                            OR: [
                              { role: organizationAdminRole },
                              { role: organizationInstructorRole },
                            ],
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
