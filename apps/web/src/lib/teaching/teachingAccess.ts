import "server-only";

import { cache } from "react";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";

export type TeachingUser = {
  id: string;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
};

export type TeachingPageAccess = {
  authenticated: boolean;
  teachingUser: TeachingUser | null;
};

/**
 * One request-scoped lookup shared by the teaching layout and its pages.
 * Database roles are authoritative; email and environment configuration never
 * grant teaching or administrator privileges.
 */
export const getTeachingPageAccess = cache(async (): Promise<TeachingPageAccess> => {
  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    return { authenticated: false, teachingUser: null };
  }

  const canAccessTeaching =
    access.capabilities.isAdmin || access.capabilities.isTeacher;

  return {
    authenticated: true,
    teachingUser: canAccessTeaching
      ? {
          id: access.user.id,
          email: access.user.email,
          roles: access.capabilities.roles,
          isAdmin: access.capabilities.isAdmin,
        }
      : null,
  };
});

export async function getTeachingUser(): Promise<TeachingUser | null> {
  return (await getTeachingPageAccess()).teachingUser;
}

/**
 * Teachers manage records they own. Admins have the same creation privileges
 * and may additionally manage every teaching record for support/operations.
 */
export function ownedTeachingRecordWhere(user: TeachingUser) {
  return user.isAdmin ? {} : { ownerId: user.id };
}
