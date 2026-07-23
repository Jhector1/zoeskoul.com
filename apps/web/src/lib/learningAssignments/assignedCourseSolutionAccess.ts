import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { actorKeyOf } from "@/lib/practice/actor";
import { resolveSubjectFinishState } from "@/lib/review/api/shared/resolveSubjectFinishState";
import { getLearningAssignmentContextsForSubject } from "./assignmentAccessServer";
import { canViewLearningAssignmentSolutions } from "./solutionPolicy";

/**
 * Resolves reveal access for a private course without changing the shared
 * lesson renderer. When more than one active delivery targets the same learner
 * and course, every delivery must allow reveal; the most restrictive teacher
 * policy wins and cannot be bypassed by a second assignment.
 */
export async function canViewAssignedCourseSolutions(
  prisma: PrismaClient,
  args: {
    userId: string;
    subjectId: string;
    subjectSlug: string;
    locale: string;
    now?: Date;
  },
): Promise<boolean> {
  const contexts = await getLearningAssignmentContextsForSubject(prisma, {
    userId: args.userId,
    subjectId: args.subjectId,
    now: args.now,
  });

  if (contexts.length === 0) return false;

  const needsCompletion = contexts.some(
    (context) => context.solutionVisibility === "after_completion",
  );

  let completed = false;
  if (needsCompletion) {
    const finish = await resolveSubjectFinishState({
      subjectSlug: args.subjectSlug,
      actor: { userId: args.userId, guestId: null },
      locale: args.locale,
    });

    completed = Boolean(
      finish.ok && finish.state.remainingPublishedModuleCount === 0,
    );
  }

  return contexts.every((context) =>
    canViewLearningAssignmentSolutions({
      policy: context.solutionVisibility,
      dueAt: context.dueAt,
      completed,
      now: args.now,
    }),
  );
}
