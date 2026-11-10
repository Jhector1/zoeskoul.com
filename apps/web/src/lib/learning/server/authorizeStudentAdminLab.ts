import "server-only";

import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";
import { prisma } from "@/lib/prisma";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import {
  matchesPublishedAdminTopic,
  STUDENT_ADMIN_COURSE_SLUG,
  type StudentAdminLabTarget,
} from "./learningAdminStudentPolicy";

/**
 * This check is intentionally stricter than public lesson viewing.
 * Root-capable lab sessions require an authenticated, actively enrolled user,
 * an active published subject+module, an exact published topic bundle and the
 * same practice access decision used elsewhere in ZoeLearning.
 *
 * No draft sources, client-side course claims or student-computed grants qualify.
 */
export async function authorizeStudentAdminLab(args: {
  actor: Actor;
  request: Request;
  target: StudentAdminLabTarget;
}): Promise<boolean> {
  if (!args.actor.userId) return false;
  const actorKey = actorKeyOf(args.actor);

  const [enrollment, module] = await Promise.all([
    prisma.subjectEnrollment.findFirst({
      where: {
        actorKey,
        userId: args.actor.userId,
        archivedAt: null,
        status: { in: ["enrolled", "completed"] },
        subject: { slug: STUDENT_ADMIN_COURSE_SLUG, status: "active" },
      },
      select: { subjectId: true },
    }),
    prisma.practiceModule.findFirst({
      where: {
        slug: args.target.moduleSlug,
        subject: { slug: STUDENT_ADMIN_COURSE_SLUG, status: "active" },
      },
      select: { subjectId: true },
    }),
  ]);

  if (!enrollment || !module || enrollment.subjectId !== module.subjectId) return false;

  // Resolves ONLY installed published curriculum manifest content. If Course 2
  // remains draft-only, this must return null or fail the exact subject match.
  let topic: unknown;
  try {
    topic = resolveTopicBundleManifest({
      subjectSlug: STUDENT_ADMIN_COURSE_SLUG,
      topicSlugOrId: args.target.topicSlug,
    });
  } catch {
    return false;
  }
  if (!matchesPublishedAdminTopic(args.target, topic)) return false;

  const access = await resolvePracticeAccess({
    prisma,
    actor: args.actor,
    locale: "en",
    req: args.request,
    params: {
      subject: STUDENT_ADMIN_COURSE_SLUG,
      module: args.target.moduleSlug,
      sessionId: null,
      returnUrl: null,
      returnTo: null,
    },
    session: null,
  });
  return access.ok;
}
