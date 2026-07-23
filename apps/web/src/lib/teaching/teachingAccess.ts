import "server-only";

import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveTeachingRoleAccess } from "./teachingRoleAccess";

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

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "").split(",");
}

async function resolveTeachingUserForIdentity(args: {
  userId?: string;
  email?: string | null;
}): Promise<TeachingUser | null> {
  const email = args.email?.trim().toLowerCase() ?? null;
  if (!args.userId && !email) return null;

  const user = await prisma.user.findFirst({
    where: args.userId ? { id: args.userId } : { email },
    select: { id: true, email: true, roles: true },
  });
  if (!user) return null;

  const access = resolveTeachingRoleAccess({
    roles: user.roles ?? [],
    email: user.email,
    configuredAdminEmails: configuredAdminEmails(),
  });
  if (!access.allowed) return null;

  return {
    id: user.id,
    email: user.email,
    roles: access.roles,
    isAdmin: access.isAdmin,
  };
}

/**
 * One request-scoped lookup shared by the teaching layout and its pages.
 * It distinguishes a signed-out visitor from an authenticated learner so the
 * page guard can choose the correct redirect without duplicating auth logic.
 */
export const getTeachingPageAccess = cache(async (): Promise<TeachingPageAccess> => {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email ?? null;
  const authenticated = Boolean(userId || email);

  if (!authenticated) return { authenticated: false, teachingUser: null };

  return {
    authenticated: true,
    teachingUser: await resolveTeachingUserForIdentity({ userId, email }),
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
