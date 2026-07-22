import "server-only";

import { prisma } from "@/lib/prisma";
import { actorKeyOf, getActor } from "@/lib/practice/actor";
import {
  createContinueLearningEntry,
  createStartLearningEntry,
  type LearningEntry,
} from "@/lib/learning/entry";

/**
 * Finds the learner's best lesson entry point.
 *
 * Review progress owns exact module recency. Enrollment is only the fallback
 * for a learner who has chosen a course but has not opened a lesson yet.
 */
export async function resolveLearningEntry(): Promise<LearningEntry> {
  const actor = await getActor();
  if (!actor.userId) return createStartLearningEntry();

  const actorKey = actorKeyOf(actor);

  const [recentProgress, recentEnrollment] = await Promise.all([
    prisma.reviewProgress.findFirst({
      where: { actorKey },
      orderBy: { updatedAt: "desc" },
      select: {
        subjectSlug: true,
        moduleId: true,
      },
    }),
    prisma.subjectEnrollment.findFirst({
      where: {
        actorKey,
        archivedAt: null,
        status: { in: ["enrolled", "completed"] },
        subject: { status: "active" },
      },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      select: {
        subject: {
          select: {
            slug: true,
            modules: {
              orderBy: { order: "asc" },
              take: 1,
              select: { slug: true },
            },
          },
        },
      },
    }),
  ]);

  if (recentProgress) {
    const activeModule = await prisma.practiceModule.findFirst({
      where: {
        slug: recentProgress.moduleId,
        subject: {
          slug: recentProgress.subjectSlug,
          status: "active",
        },
      },
      select: { slug: true },
    });

    if (activeModule) {
      return createContinueLearningEntry({
        subjectSlug: recentProgress.subjectSlug,
        moduleSlug: activeModule.slug,
      });
    }
  }

  const firstModule = recentEnrollment?.subject.modules[0];
  if (recentEnrollment && firstModule) {
    return createContinueLearningEntry({
      subjectSlug: recentEnrollment.subject.slug,
      moduleSlug: firstModule.slug,
    });
  }

  return createStartLearningEntry();
}
