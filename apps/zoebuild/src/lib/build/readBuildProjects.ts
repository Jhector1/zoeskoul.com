import "server-only";

import {
  BUILD_PROJECT_LIFECYCLE_STATUSES,
  isBuildProjectLifecycleStatus,
  parseProjectSpecification,
  type BuildProjectDetailRecord,
  type BuildProjectLifecycleStatus,
  type BuildProjectReadPort,
  type BuildProjectSummaryRecord,
} from "@zoeskoul/build-application";
import type { PrismaClient } from "@zoeskoul/db";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

function lifecycleStatus(value: unknown): BuildProjectLifecycleStatus {
  if (!isBuildProjectLifecycleStatus(value)) {
    throw new Error(
      `Unknown ZoeBuild lifecycle status: ${String(value)}. Expected one of ${BUILD_PROJECT_LIFECYCLE_STATUSES.join(", ")}.`,
    );
  }
  return value;
}

function mapSummary(row: {
  id: string;
  status: unknown;
  stackId: string | null;
  codeProject: {
    id: string;
    title: string;
    description: string | null;
    language: string;
    currentVersion: number;
    updatedAt: Date;
  };
}): BuildProjectSummaryRecord {
  return {
    buildProjectId: row.id,
    codeProjectId: row.codeProject.id,
    title: row.codeProject.title,
    description: row.codeProject.description,
    status: lifecycleStatus(row.status),
    stackId: row.stackId,
    sourceVersion: row.codeProject.currentVersion,
    language: row.codeProject.language as WorkspaceStateV2["language"],
    updatedAt: row.codeProject.updatedAt.toISOString(),
  };
}

/**
 * Prisma adapter for owner-scoped Build reads.
 *
 * CodeProject.ownerId remains the ownership authority. We intentionally do not
 * inherit generic CodeProject grants here; Build collaboration gets an explicit
 * policy in a later wave instead of becoming enabled accidentally.
 */
export function createPrismaBuildProjectReader(
  client: PrismaClient,
): BuildProjectReadPort {
  return {
    async listOwnedBuildProjects(ownerId) {
      const userId = ownerId.trim();
      if (!userId) return [];

      const rows = await client.buildProject.findMany({
        where: {
          status: { not: "archived" },
          codeProject: {
            ownerId: userId,
            archivedAt: null,
          },
        },
        select: {
          id: true,
          status: true,
          stackId: true,
          codeProject: {
            select: {
              id: true,
              title: true,
              description: true,
              language: true,
              currentVersion: true,
              updatedAt: true,
            },
          },
        },
      });

      return rows
        .map(mapSummary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getOwnedBuildProject(ownerId, buildProjectId) {
      const userId = ownerId.trim();
      const projectId = buildProjectId.trim();
      if (!userId || !projectId) return null;

      const row = await client.buildProject.findFirst({
        where: {
          id: projectId,
          codeProject: {
            ownerId: userId,
            archivedAt: null,
          },
        },
        select: {
          id: true,
          status: true,
          stackId: true,
          specification: true,
          codeProject: {
            select: {
              id: true,
              title: true,
              description: true,
              language: true,
              currentVersion: true,
              updatedAt: true,
              entryPath: true,
              activePath: true,
              workspace: true,
            },
          },
        },
      });

      if (!row) return null;

      const summary = mapSummary(row);
      const specification =
        row.specification == null
          ? null
          : parseProjectSpecification(row.specification);

      // Never expose a stripped managed snapshot when an operator disables reads.
      // This lookup uses the pre-existing history table, so legacy installs do
      // not need the additive managed-binary migration merely to open projects.
      if (process.env.ZOEBUILD_MANAGED_R2_READS !== "1") {
        const history = await client.codeProjectRevision.findUnique({
          where: {projectId_version: {projectId: row.codeProject.id, version: summary.sourceVersion}},
          select: {meta: true},
        });
        if (history?.meta && typeof history.meta === "object" &&
            Object.prototype.hasOwnProperty.call(history.meta, "managedBinaryRevisionDigest")) {
          throw Error("MANAGED_READ_DISABLED_FOR_SAVED_REVISION");
        }
      }
      const detail: BuildProjectDetailRecord = {
        ...summary,
        entryPath: row.codeProject.entryPath,
        activePath: row.codeProject.activePath,
        workspace: process.env.ZOEBUILD_MANAGED_R2_READS === "1"
          ? await (await import("./prismaManagedBinaryRead")).readCanonicalOwnedBuildWorkspace({
              client, ownerId: userId, buildProjectId: projectId,
              sourceVersion: summary.sourceVersion, legacyWorkspace: row.codeProject.workspace,
            })
          : row.codeProject.workspace as unknown as WorkspaceStateV2,
        specification,
      };

      return detail;
    },
  };
}
