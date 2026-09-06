import "server-only";

import { prisma } from "@/lib/prisma";
import {
  listRawAssignableCourses,
} from "@/lib/learningAssignments/assignableCourses";
import {
  resolveSubjectDeliveryPresentations,
} from "@/lib/subjects/resolveSubjectDeliveryPresentation";

export type LearningOrganizationCourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: string;
  enabled: boolean;
};

export async function listLearningOrganizationCourses(
  args: {
    organizationId: string;
    locale: string;
  },
): Promise<
  LearningOrganizationCourseRow[]
> {
  const [rawCourses, accesses] =
    await Promise.all([
      listRawAssignableCourses(),
      prisma.learningOrganizationCourseAccess.findMany(
        {
          where: {
            organizationId:
              args.organizationId,
          },
          select: {
            subjectId: true,
          },
        },
      ),
    ]);

  const courses =
    await resolveSubjectDeliveryPresentations(
      rawCourses,
      args.locale,
    );

  const enabled = new Set(
    accesses.map((row) => row.subjectId),
  );

  return courses.map((course) => ({
    ...course,
    enabled: enabled.has(course.id),
  }));
}

export async function enableLearningOrganizationCourse(
  args: {
    organizationId: string;
    subjectId: string;
  },
) {
  const subject =
    await prisma.practiceSubject.findFirst({
      where: {
        id: args.subjectId,
        status: "active",
        visibility: "private",
      },
      select: {
        id: true,
      },
    });

  if (!subject) {
    return {
      ok: false as const,
      reason: "course_unavailable" as const,
    };
  }

  const access =
    await prisma.learningOrganizationCourseAccess.upsert(
      {
        where: {
          organizationId_subjectId: {
            organizationId:
              args.organizationId,
            subjectId: args.subjectId,
          },
        },
        create: {
          organizationId:
            args.organizationId,
          subjectId: args.subjectId,
        },
        update: {},
        select: {
          organizationId: true,
          subjectId: true,
          enabledAt: true,
        },
      },
    );

  return {
    ok: true as const,
    access,
  };
}

export async function disableLearningOrganizationCourse(
  args: {
    organizationId: string;
    subjectId: string;
  },
) {
  const assignmentCount =
    await prisma.learningAssignmentGroup.count({
      where: {
        group: {
          organizationId:
            args.organizationId,
        },
        assignment: {
          subjectId: args.subjectId,
        },
      },
    });

  if (assignmentCount > 0) {
    return {
      ok: false as const,
      reason: "course_in_use" as const,
    };
  }

  await prisma.learningOrganizationCourseAccess.deleteMany(
    {
      where: {
        organizationId:
          args.organizationId,
        subjectId: args.subjectId,
      },
    },
  );

  return {
    ok: true as const,
  };
}
