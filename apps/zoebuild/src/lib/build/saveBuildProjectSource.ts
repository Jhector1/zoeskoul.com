import "server-only";
import {managedBinaryWriteLane} from "./managedBinaryPrismaPolicy";

import {
  BuildSourceConflictError,
  BuildSourceInputError,
  type BuildProjectSourceWritePort,
} from "@zoeskoul/build-application";
import {
  Prisma,
  type PrismaClient,
} from "@zoeskoul/db";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { invalidateManagedDependenciesOnManifestEdit } from "./invalidateManagedDependenciesOnManifestEdit";

import {
  ProjectVersionConflictError,
  saveCodeProjectInTransaction,
} from "@zoeskoul/platform-server/projects/saveCodeProject";
import {
  BuildWorkspaceMutationError,
  parseBuildWorkspaceMutation,
} from "./buildWorkspaceMutation";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createPrismaBuildProjectSourceWriter(
  client: PrismaClient,
  options: Readonly<{createRevision?:boolean}> = {},
  trustedDependencyMode?: "automatic" | "explicit",
): BuildProjectSourceWritePort {
  return {
    async saveOwnedBuildProjectSource(input) {
      // One managed writer, selected only by trusted server configuration.
      // No fallback after a failed managed operation.
      if (managedBinaryWriteLane(input.buildProjectId)) {
        const rehearsed = await (await import("./managedBinaryPilotSourceWriter"))
          .savePilotManagedBinarySource(client, input, options, trustedDependencyMode);
        if (rehearsed !== undefined) return rehearsed;
      }
      return client.$transaction(async (tx) => {
        const userId = input.ownerId.trim();
        const buildProjectId = input.buildProjectId.trim();
        if (!userId || !buildProjectId) return null;

        const buildProject = await tx.buildProject.findFirst({
          where: {
            id: buildProjectId,
            status: { not: "archived" },
            codeProject: {
              ownerId: userId,
              archivedAt: null,
            },
          },
          select: {
            id: true,
            codeProject: {
              select: {
                id: true,
                title: true,
                description: true,
                language: true,
                visibility: true,
                shareToken: true,
                scopeKind: true,
                subjectId: true,
                moduleId: true,
                assignmentId: true,
                scopeKey: true,
                settings: true,
                meta: true,
                workspace: true,
                currentVersion: true,
              },
            },
          },
        });

        if (!buildProject) return null;
        // A disabled or unselected managed writer MUST NOT fall back to the
        // legacy path for a head already committed with externalized bytes.
        const history = await tx.codeProjectRevision.findUnique({
          where: {projectId_version: {projectId: buildProject.codeProject.id,
            version: buildProject.codeProject.currentVersion}}, select: {meta: true},
        });
        if (history?.meta && typeof history.meta === "object" &&
            Object.prototype.hasOwnProperty.call(history.meta, "managedBinaryRevisionDigest")) {
          throw new BuildSourceInputError("Managed project writes are disabled. Existing source is unchanged.");
        }

        const parsed = parseBuildWorkspaceMutation(input.workspace);
        // User-authored package changes must not keep the OLD signed lock.
        // Automatic bootstrap writes and historical restore are independent.
        const workspace = options.createRevision !== false &&
          input.clientInstanceId !== "zoebuild-lock-bootstrap"
          ? invalidateManagedDependenciesOnManifestEdit(
              parseBuildWorkspaceMutation(buildProject.codeProject.workspace), parsed)
          : parsed;
        if (workspace.language !== buildProject.codeProject.language) {
          throw new BuildWorkspaceMutationError([
            "Workspace language cannot change during a ZoeBuild source save.",
          ]);
        }

        const entryPath = pathOf(workspace.nodes, workspace.entryFileId);
        const activePath = pathOf(workspace.nodes, workspace.activeFileId);

        try {
          const saved = await saveCodeProjectInTransaction(tx, {
            projectId: buildProject.codeProject.id,
            ownerId: userId,
            title: buildProject.codeProject.title,
            description: buildProject.codeProject.description,
            language: buildProject.codeProject.language,
            workspace: toPrismaJson(workspace),
            settings:
              (buildProject.codeProject.settings ??
                null) as Prisma.InputJsonValue | null,
            meta:
              (buildProject.codeProject.meta ??
                null) as Prisma.InputJsonValue | null,
            entryPath,
            activePath,
            visibility: buildProject.codeProject.visibility,
            shareToken: buildProject.codeProject.shareToken,
            scope: {
              kind: buildProject.codeProject.scopeKind,
              subjectId: buildProject.codeProject.subjectId,
              moduleId: buildProject.codeProject.moduleId,
              assignmentId: buildProject.codeProject.assignmentId,
              scopeKey: buildProject.codeProject.scopeKey,
            },
            createRevision: options.createRevision ?? true,
            revisionNote: "ZoeBuild source save",
            createdById: userId,
            baseVersion: input.baseVersion,
            clientInstanceId: input.clientInstanceId ?? null,
            clientDraftUpdatedAt: input.clientDraftUpdatedAt ?? null,
          });

          return {
            sourceVersion: saved.version,
            changed: saved.changed,
            workspaceChanged: saved.workspaceChanged,
            updatedAt: saved.project.updatedAt.toISOString(),
          };
        } catch (error) {
          if (error instanceof ProjectVersionConflictError) {
            throw new BuildSourceConflictError({
              serverVersion: error.serverVersion,
              serverUpdatedAt: error.serverUpdatedAt.toISOString(),
              title: error.title,
            });
          }
          throw error;
        }
      });
    },
  };
}
