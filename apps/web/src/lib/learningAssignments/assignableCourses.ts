import "server-only";

import { prisma } from "@/lib/prisma";

export function listRawAssignableCourses() {
  return prisma.practiceSubject.findMany({
    where: {
      status: "active",
      visibility: "private",
    },
    orderBy: [
      { visibility: "desc" },
      { order: "asc" },
    ],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      visibility: true,
    },
  });
}
