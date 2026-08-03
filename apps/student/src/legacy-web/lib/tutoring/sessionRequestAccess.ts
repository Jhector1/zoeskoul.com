import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { getTutoringSessionAccess } from "./sessionAccess";

export async function getTutoringRequestAccess(sessionId: string) {
  const authSession = await auth();
  const userId = (authSession?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  // Learners, invited teachers, and the owner resolve in one narrow query.
  // Only fall back to the teaching lookup when an otherwise unrelated user may
  // be a platform administrator.
  let access = await getTutoringSessionAccess(prisma, {
    sessionId,
    userId,
    teachingUser: null,
  });
  let teachingUser = null;

  if (!access) {
    teachingUser = await getTeachingUser();
    if (!teachingUser?.isAdmin) return null;
    access = await getTutoringSessionAccess(prisma, {
      sessionId,
      userId,
      teachingUser,
    });
  }
  if (!access) return null;

  return {
    userId,
    teachingUser,
    ...access,
  };
}
