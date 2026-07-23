import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { getTutoringSessionAccess } from "./sessionAccess";

export async function getTutoringRequestAccess(sessionId: string) {
  const authSession = await auth();
  const userId = (authSession?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const teachingUser = await getTeachingUser();
  const tutoringSession = await getTutoringSessionAccess(prisma, {
    sessionId,
    userId,
    teachingUser,
  });
  if (!tutoringSession) return null;

  return {
    userId,
    teachingUser,
    tutoringSession,
    canEdit: Boolean(teachingUser || tutoringSession.allowStudentEditing),
  };
}
