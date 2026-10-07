import "server-only";

import { prisma } from "@/lib/prisma";
import { hasReviewModule } from "@/lib/subjects/registry";
import {
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";

export type TeacherClassCourseTeachingUser =
  Parameters<typeof ownedTeachingRecordWhere>[0];

export async function getTeacherClassCourseContext(args: {
  classId: string;
  subjectSlug: string;
  teachingUser: TeacherClassCourseTeachingUser;
}) {
  const group = await prisma.learningGroup.findFirst({
    where: {
      id: args.classId,
      ...ownedTeachingRecordWhere(args.teachingUser),
      assignments: {
        some: {
          assignment: {
            subject: {
              slug: args.subjectSlug,
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!group) return null;

  const subject = await prisma.practiceSubject.findUnique({
    where: {
      slug: args.subjectSlug,
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });

  if (!subject) return null;

  return {
    group,
    subject,
  };
}

export async function findFirstCompiledClassCourseModule(
  subjectSlug: string,
) {
  const modules = await prisma.practiceModule.findMany({
    where: {
      subject: {
        slug: subjectSlug,
      },
    },
    orderBy: [
      { order: "asc" },
      { slug: "asc" },
    ],
    select: {
      slug: true,
    },
  });

  return (
    modules.find((module) =>
      hasReviewModule(
        subjectSlug,
        module.slug,
      ),
    )?.slug ?? null
  );
}
