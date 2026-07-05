import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { ResolvedSharedChallengeTarget } from "./target";

export async function assertPublishedChallengeTargetAvailable(args: {
  prisma: PrismaClient;
  target: ResolvedSharedChallengeTarget;
}) {
  const subject = await args.prisma.practiceSubject.findUnique({
    where: { slug: args.target.subjectSlug },
    select: { id: true, status: true },
  });

  if (!subject || subject.status !== "active") {
    throw new Error(
      `Published subject "${args.target.subjectSlug}" is not active in the practice database.`,
    );
  }

  const section = await args.prisma.practiceSection.findFirst({
    where: {
      slug: args.target.sectionSlug,
      subjectId: subject.id,
    },
    select: {
      id: true,
      module: { select: { slug: true } },
    },
  });

  if (!section || section.module?.slug !== args.target.moduleSlug) {
    throw new Error(
      `Published section "${args.target.sectionSlug}" is not seeded under module "${args.target.moduleSlug}".`,
    );
  }

  return { subjectId: subject.id, sectionId: section.id };
}
