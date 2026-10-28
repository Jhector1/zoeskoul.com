import "server-only";

import {
  BuildSourceConflictError,
  type BuildPlanApplyPersistenceInput,
  type BuildPlanApplyWritePort,
} from "@zoeskoul/build-application";

import {
  Prisma,
  type PrismaClient,
} from "@zoeskoul/db";

import {
  ProjectVersionConflictError,
  saveCodeProjectInTransaction,
} from "@zoeskoul/platform-server/projects/saveCodeProject";

/** Changing stacks would discard the existing source architecture and break history. */
export class BuildStackReplacementForbiddenError extends Error {
  readonly code = "BUILD_STACK_REPLACEMENT_FORBIDDEN" as const;
  constructor() {
    super("Existing project architecture cannot be replaced by a different stack. Ask Zoé to edit this project's existing files instead.");
    this.name = "BuildStackReplacementForbiddenError";
  }
}

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? {
        ...(
          value as
            Record<
              string,
              unknown
            >
        ),
      }
    : {};
}

function sourceSettings(
  current: unknown,

  input:
    BuildPlanApplyPersistenceInput,
) {
  return {
    ...asRecord(current),

    zoeBuild: {
      schemaVersion: 1,

      stackId:
        input.stackId,

      templateId:
        input.templateId,

      dependencyLock:
        input.dependencyLock,
      projectSpecification:
        input.specification,
    },
  };
}

function sourceMeta(
  current: unknown,

  input:
    BuildPlanApplyPersistenceInput,
) {
  return {
    ...asRecord(current),

    product:
      "zoebuild",

    buildSpecificationVersion:
      input.specification.version,

    stackId:
      input.stackId,

    templateId:
      input.templateId,

    lastMutation:
      "apply-plan",
  };
}

/**
 * Applies source + Build metadata in one Prisma transaction.
 *
 * CodeProject remains the canonical source owner.
 * BuildProject remains the Build product/runtime metadata owner.
 */
export function createPrismaBuildProjectPlanWriter(
  client: PrismaClient,
): BuildPlanApplyWritePort {
  return {
    async applyOwnedBuildProjectPlan(
      input,
    ) {
      try {
        return await client.$transaction(
          async (tx) => {
            const buildProject =
              await tx.buildProject
                .findUnique({
                  where: {
                    id:
                      input.buildProjectId,
                  },

                  select: {
                    id: true,
                    stackId: true,

                    codeProject: {
                      select: {
                        id: true,
                        ownerId: true,
                        title: true,
                        description: true,
                        settings: true,
                        meta: true,

                        visibility:
                          true,

                        shareToken:
                          true,

                        scopeKind:
                          true,

                        subjectId:
                          true,

                        moduleId:
                          true,

                        assignmentId:
                          true,

                        scopeKey:
                          true,
                      },
                    },
                  },
                });

            if (
              !buildProject ||
              buildProject
                .codeProject
                .ownerId !==
                input.ownerId
            ) {
              return null;
            }

            // A model-generated plan cannot silently swap an existing React
            // project for commerce-static-v1 or any other runtime. Check in
            // the same transaction as the versioned workspace save.
            if (buildProject.stackId && buildProject.stackId !== input.stackId) {
              throw new BuildStackReplacementForbiddenError();
            }

            const codeProject =
              buildProject
                .codeProject;

            const saved =
              await saveCodeProjectInTransaction(
                tx,
                {
                  projectId:
                    codeProject.id,

                  ownerId:
                    input.ownerId,

                  title:
                    input.specification.name,

                  description:
                    codeProject.description,

                  language:
                    input.workspace.language,

                  workspace:
                    toPrismaJson(
                      input.workspace,
                    ),

                  settings:
                    toPrismaJson(
                      sourceSettings(
                        codeProject.settings,
                        input,
                      ),
                    ),

                  meta:
                    toPrismaJson(
                      sourceMeta(
                        codeProject.meta,
                        input,
                      ),
                    ),

                  entryPath:
                    input.entryPath,

                  activePath:
                    input.activePath,

                  visibility:
                    codeProject.visibility,

                  shareToken:
                    codeProject.shareToken,

                  scope: {
                    kind:
                      codeProject.scopeKind,

                    subjectId:
                      codeProject.subjectId,

                    moduleId:
                      codeProject.moduleId,

                    assignmentId:
                      codeProject.assignmentId,

                    scopeKey:
                      codeProject.scopeKey,
                  },

                  createRevision:
                    true,

                  revisionNote:
                    "ZoeBuild applied plan",

                  createdById:
                    input.ownerId,

                  baseVersion:
                    input.baseVersion,

                  clientInstanceId:
                    "zoebuild-apply-plan",
                },
              );

            await tx.buildProject
              .update({
                where: {
                  id:
                    buildProject.id,
                },

                data: {
                  // Applying a plan changes source but does not claim
                  // that build validation or deployment has completed.
                  status:
                    "draft",

                  specVersion:
                    input
                      .specification
                      .version,

                  stackId:
                    input.stackId,

                  specification:
                    toPrismaJson(
                      input.specification,
                    ),
                },
              });

            return {
              sourceVersion:
                saved.version,

              changed:
                saved.changed,

              workspaceChanged:
                saved.workspaceChanged,

              updatedAt:
                saved.project
                  .updatedAt
                  .toISOString(),
            };
          },
        );
      } catch (error) {
        if (
          error instanceof
          ProjectVersionConflictError
        ) {
          throw new BuildSourceConflictError({
            serverVersion:
              error.serverVersion,

            serverUpdatedAt:
              error.serverUpdatedAt
                .toISOString(),

            title:
              error.title,
          });
        }

        throw error;
      }
    },
  };
}
