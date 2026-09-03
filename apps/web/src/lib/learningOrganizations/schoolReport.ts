import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getLearningGroupDashboard,
} from "@/lib/learningGroups/classDashboard";

import {
  projectSchoolReport,
  type TeacherSchoolReport,
} from "./schoolReportProjection";

export async function getLearningOrganizationReport(
  organizationId: string,
): Promise<TeacherSchoolReport | null> {
  const school =
    await prisma.learningOrganization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        groups: {
          orderBy: { name: "asc" },
          select: {
            id: true,
          },
        },
      },
    });

  if (!school) {
    return null;
  }

  const dashboards = (
    await Promise.all(
      school.groups.map((group) =>
        getLearningGroupDashboard(group.id),
      ),
    )
  ).flatMap((dashboard) =>
    dashboard ? [dashboard] : [],
  );

  return projectSchoolReport({
    school: {
      id: school.id,
      name: school.name,
    },
    dashboards,
  });
}
