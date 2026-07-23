import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveSubjectDeliveryPresentations } from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";

export async function loadTutoringSessionEditorData(args: {
  locale: string;
  teachingUser: TeachingUser;
}) {
  const [subjects, groups] = await Promise.all([
    prisma.practiceSubject.findMany({
      where: { status: "active" },
      orderBy: { order: "asc" },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: {
            sections: { orderBy: { order: "asc" } },
            topics: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    prisma.learningGroup.findMany({
      where: ownedTeachingRecordWhere(args.teachingUser),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
    }),
  ]);

  const presentations = await resolveSubjectDeliveryPresentations(
    subjects.map(({ modules: _modules, ...subject }) => subject),
    args.locale,
  );

  return {
    courses: subjects.map((subject, index) => ({
      ...presentations[index],
      id: subject.id,
      modules: subject.modules.map((module) => ({
        slug: module.slug,
        title: module.title,
        sections: module.sections.map((section) => ({
          slug: section.slug,
          title: section.title,
        })),
        topics: module.topics.map((topic) => ({
          id: topic.slug,
          title: topic.titleKey,
        })),
      })),
    })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberCount: group._count.members,
    })),
  };
}
