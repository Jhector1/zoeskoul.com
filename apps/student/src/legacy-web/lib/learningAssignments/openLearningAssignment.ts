import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { getLearningAssignmentForUser } from "./assignmentAccessServer";
import { learningAssignmentAvailability } from "./assignmentWindow";
import { buildAssignedCourseHref } from "./assignedCourseHref";

export type OpenLearningAssignmentResult =
  | { ok: false; status: 404; error: "not_found" }
  | {
      ok: false;
      status: 403;
      error: "upcoming" | "closed";
      availability: "upcoming" | "closed";
    }
  | {
      ok: true;
      href: string;
      subjectSlug: string;
      defaultModuleSlug: string | null;
    };

/**
 * Opens an assigned course without consulting billing. The assignment is the
 * entitlement; enrollment only records progress and resume state.
 */
export async function openLearningAssignmentForUser(
  prisma: PrismaClient,
  args: {
    assignmentId: string;
    userId: string;
    actorKey: string;
    locale?: string | null;
    now?: Date;
  },
): Promise<OpenLearningAssignmentResult> {
  const assignment = await getLearningAssignmentForUser(prisma, {
    assignmentId: args.assignmentId,
    userId: args.userId,
  });
  if (!assignment) return { ok: false, status: 404, error: "not_found" };

  const availability = learningAssignmentAvailability(assignment, args.now);
  if (availability !== "open" && availability !== "past_due") {
    return {
      ok: false,
      status: 403,
      error: availability === "upcoming" ? "upcoming" : "closed",
      availability: availability === "upcoming" ? "upcoming" : "closed",
    };
  }

  await prisma.subjectEnrollment.upsert({
    where: {
      actorKey_subjectId: {
        actorKey: args.actorKey,
        subjectId: assignment.subjectId,
      },
    },
    create: {
      actorKey: args.actorKey,
      userId: args.userId,
      subjectId: assignment.subjectId,
      source: "assignment",
      status: "enrolled",
      lastSeenAt: new Date(),
      meta: { learningAssignmentId: assignment.id },
    },
    update: {
      userId: args.userId,
      source: "assignment",
      archivedAt: null,
      lastSeenAt: new Date(),
      meta: { learningAssignmentId: assignment.id },
    },
  });

  const defaultModuleSlug = assignment.subject.modules[0]?.slug ?? null;
  return {
    ok: true,
    href: buildAssignedCourseHref({
      subjectSlug: assignment.subject.slug,
      defaultModuleSlug,
      locale: args.locale,
    }),
    subjectSlug: assignment.subject.slug,
    defaultModuleSlug,
  };
}
