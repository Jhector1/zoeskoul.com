import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { getTutoringSessionAccess } from "./sessionAccess";
import type { TutoringSnapshot } from "./sessionSnapshot";
import type { ReviewModule } from "@/lib/subjects/types";

export async function loadTutoringSessionPage(args: {
  sessionId: string;
  moduleSlug?: string | null;
}) {
  const authSession = await auth();
  const userId = (authSession?.user as any)?.id as string | undefined;
  if (!userId) return { status: "signed_out" as const };

  const teachingUser = await getTeachingUser();
  const session = await getTutoringSessionAccess(prisma, {
    sessionId: args.sessionId,
    userId,
    teachingUser,
  });
  if (!session) return { status: "forbidden" as const };

  const snapshot = session.snapshot as unknown as TutoringSnapshot;
  const selected =
    snapshot.modules.find((item) => item.sessionModuleSlug === args.moduleSlug) ??
    snapshot.modules[0] ??
    null;

  if (!selected) return { status: "empty" as const, session, snapshot };

  return {
    status: "ready" as const,
    session,
    snapshot,
    selected: {
      ...selected,
      module: selected.module as ReviewModule,
    },
    canEdit: Boolean(teachingUser || session.allowStudentEditing),
    isTutor: Boolean(teachingUser),
  };
}
