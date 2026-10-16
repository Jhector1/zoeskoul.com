import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  Prisma,
  type PrismaClient,
} from "@zoeskoul/db";

export const ZOEBUILD_SELF_HOSTED_PROVIDER =
  "zoebuild-self-hosted-v1";

export const ZOEBUILD_STATIC_ASSETS_KIND =
  "static-assets-v1";

export class BuildPublishPersistenceError extends Error {
  constructor(
    readonly code:
      | "BUILD_PUBLISH_NOT_FOUND"
      | "BUILD_PUBLISH_SOURCE_CHANGED"
      | "BUILD_PUBLISH_REVISION_INVALID",
    message: string,
  ) {
    super(message);

    this.name =
      "BuildPublishPersistenceError";
  }
}

export type PublishStaticBuildInput =
  Readonly<{
    ownerId: string;
    buildProjectId: string;
    expectedSourceVersion: number;
    stackId: string;
    templateId: string;
    publicOrigin: string;
  }>;

export type PublishStaticBuildResult =
  Readonly<{
    deploymentId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    reused: boolean;
  }>;

function artifactHash(
  workspace: unknown,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        workspace ?? null,
      ),
    )
    .digest("hex");
}

export function createPrismaSelfHostedStaticPublisher(
  client: PrismaClient,
) {
  return {
    async publishOwnedProject(
      input:
        PublishStaticBuildInput,
    ): Promise<
      PublishStaticBuildResult
    > {
      const ownerId =
        input.ownerId.trim();

      const buildProjectId =
        input.buildProjectId.trim();

      if (
        !ownerId ||
        !buildProjectId ||
        !Number.isSafeInteger(
          input.expectedSourceVersion,
        ) ||
        input.expectedSourceVersion <
          1
      ) {
        throw new BuildPublishPersistenceError(
          "BUILD_PUBLISH_NOT_FOUND",
          "Invalid publish target.",
        );
      }

      return client.$transaction(
        async (tx) => {
          const buildProject =
            await tx
              .buildProject
              .findFirst({
                where: {
                  id:
                    buildProjectId,

                  codeProject: {
                    ownerId,

                    archivedAt:
                      null,
                  },
                },

                select: {
                  id: true,

                  codeProject: {
                    select: {
                      id: true,

                      currentVersion:
                        true,

                      workspaceHash:
                        true,

                      workspace:
                        true,

                      settings:
                        true,
                    },
                  },
                },
              });

          if (!buildProject) {
            throw new BuildPublishPersistenceError(
              "BUILD_PUBLISH_NOT_FOUND",
              "Project not found.",
            );
          }

          if (
            buildProject
              .codeProject
              .currentVersion !==
            input.expectedSourceVersion
          ) {
            throw new BuildPublishPersistenceError(
              "BUILD_PUBLISH_SOURCE_CHANGED",
              "Project source changed while publishing. Publish the latest saved version.",
            );
          }

          const codeProject =
            buildProject
              .codeProject;

          const hash =
            artifactHash(
              codeProject.workspace,
            );

          const existingRevision =
            await tx
              .codeProjectRevision
              .findUnique({
                where: {
                  projectId_version: {
                    projectId:
                      codeProject.id,

                    version:
                      input
                        .expectedSourceVersion,
                  },
                },

                select: {
                  workspaceHash:
                    true,
                },
              });

          if (
            existingRevision
              ?.workspaceHash &&
            codeProject
              .workspaceHash &&
            existingRevision
              .workspaceHash !==
              codeProject
                .workspaceHash
          ) {
            throw new BuildPublishPersistenceError(
              "BUILD_PUBLISH_REVISION_INVALID",
              "The immutable source revision does not match the current source head.",
            );
          }

          /**
           * Metadata-only edits can advance CodeProject.currentVersion without
           * creating a workspace revision. Publishing closes that gap by
           * freezing the exact current source head under the version being
           * deployed. It does not mutate project source.
           */
          if (
            !existingRevision
          ) {
            await tx
              .codeProjectRevision
              .create({
                data: {
                  projectId:
                    codeProject.id,

                  version:
                    input
                      .expectedSourceVersion,

                  workspaceHash:
                    codeProject
                      .workspaceHash,

                  snapshot:
                    codeProject
                      .workspace as
                      Prisma.InputJsonValue,

                  settings:
                    codeProject
                      .settings ==
                    null
                      ? Prisma.JsonNull
                      : codeProject
                          .settings as
                          Prisma.InputJsonValue,

                  note:
                    "ZoeBuild publish snapshot",

                  meta: {
                    product:
                      "zoebuild",

                    publicationSnapshot:
                      true,
                  },

                  createdById:
                    ownerId,
                },
              });
          }

          const existingDeployment =
            await tx
              .buildDeployment
              .findFirst({
                where: {
                  buildProjectId:
                    buildProject.id,

                  sourceVersion:
                    input
                      .expectedSourceVersion,

                  environment:
                    "production",

                  kind:
                    ZOEBUILD_STATIC_ASSETS_KIND,

                  provider:
                    ZOEBUILD_SELF_HOSTED_PROVIDER,

                  status:
                    "ready",

                  artifactHash:
                    hash,
                },

                orderBy: {
                  createdAt:
                    "desc",
                },

                select: {
                  id: true,

                  sourceVersion:
                    true,

                  artifactHash:
                    true,

                  deployedAt:
                    true,
                },
              });

          if (
            existingDeployment &&
            existingDeployment
              .artifactHash &&
            existingDeployment
              .deployedAt
          ) {
            await tx
              .buildProject
              .update({
                where: {
                  id:
                    buildProject.id,
                },

                data: {
                  status:
                    "deployed",
                },
              });

            return {
              deploymentId:
                existingDeployment.id,

              sourceVersion:
                existingDeployment
                  .sourceVersion,

              artifactHash:
                existingDeployment
                  .artifactHash,

              deployedAt:
                existingDeployment
                  .deployedAt
                  .toISOString(),

              reused: true,
            };
          }

          const now =
            new Date();

          const publicPath =
            `/sites/${encodeURIComponent(
              buildProject.id,
            )}/`;

          const deployment =
            await tx
              .buildDeployment
              .create({
                data: {
                  buildProjectId:
                    buildProject.id,

                  sourceVersion:
                    input
                      .expectedSourceVersion,

                  environment:
                    "production",

                  kind:
                    ZOEBUILD_STATIC_ASSETS_KIND,

                  provider:
                    ZOEBUILD_SELF_HOSTED_PROVIDER,

                  providerRef:
                    `zoebuild:${buildProject.id}:v${input.expectedSourceVersion}`,

                  status:
                    "ready",

                  hostname:
                    new URL(
                      input.publicOrigin,
                    ).hostname,

                  artifactHash:
                    hash,

                  meta: {
                    schemaVersion:
                      1,

                    stackId:
                      input.stackId,

                    templateId:
                      input.templateId,

                    deploymentAdapterId:
                      ZOEBUILD_STATIC_ASSETS_KIND,

                    artifact: {
                      type:
                        "static-directory",

                      outputPath:
                        ".",
                    },

                    publicPath,
                  },

                  deployedAt:
                    now,
                },

                select: {
                  id: true,

                  sourceVersion:
                    true,

                  artifactHash:
                    true,

                  deployedAt:
                    true,
                },
              });

          await tx
            .buildProject
            .update({
              where: {
                id:
                  buildProject.id,
              },

              data: {
                status:
                  "deployed",
              },
            });

          if (
            !deployment
              .artifactHash ||
            !deployment
              .deployedAt
          ) {
            throw new BuildPublishPersistenceError(
              "BUILD_PUBLISH_REVISION_INVALID",
              "Deployment persistence did not return a complete ready deployment.",
            );
          }

          return {
            deploymentId:
              deployment.id,

            sourceVersion:
              deployment
                .sourceVersion,

            artifactHash:
              deployment
                .artifactHash,

            deployedAt:
              deployment
                .deployedAt
                .toISOString(),

            reused: false,
          };
        },
      );
    },
  };
}
