import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  BUILD_EXECUTOR_PROTOCOL_VERSION,
  PRODUCTION_BUILD_ARTIFACT_LIMITS,
  type ProductionBuildExecutionResponseV1,
} from "@zoeskoul/build-executor-contracts";

import {
  Prisma,
  type PrismaClient,
} from "@zoeskoul/db";

import {
  ZOEBUILD_SELF_HOSTED_PROVIDER,
  ZOEBUILD_STATIC_ASSETS_KIND,
} from "./publishBuildProject";

export const ZOEBUILD_COMPILED_ARTIFACT_PROVIDER =
  "zoebuild-postgres-bytes-v1";

export class CompiledBuildPublishError extends Error {
  constructor(
    readonly code:
      | "BUILD_PUBLISH_NOT_FOUND"
      | "BUILD_PUBLISH_SOURCE_CHANGED"
      | "BUILD_PUBLISH_REVISION_INVALID"
      | "BUILD_PUBLISH_ARTIFACT_INVALID",
    message: string,
  ) {
    super(message);

    this.name =
      "CompiledBuildPublishError";
  }
}

export type ValidatedProductionArtifactFile =
  Readonly<{
    path: string;
    bytes: Uint8Array<ArrayBuffer>;
  }>;

export type ValidatedProductionArtifact =
  Readonly<{
    artifactHash: string;
    totalBytes: number;
    files:
      readonly ValidatedProductionArtifactFile[];
  }>;

function invalid(
  message: string,
): never {
  throw new CompiledBuildPublishError(
    "BUILD_PUBLISH_ARTIFACT_INVALID",
    message,
  );
}

function safeArtifactPath(
  value: unknown,
): string {
  if (
    typeof value !==
      "string" ||
    !value ||
    value.length > 1024 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return invalid(
      "Compiled artifact contains an unsafe file path.",
    );
  }

  const segments =
    value.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === "..",
    )
  ) {
    return invalid(
      "Compiled artifact contains an unsafe file path.",
    );
  }

  return value;
}

function digestFiles(
  files:
    readonly ValidatedProductionArtifactFile[],
): string {
  const digest =
    createHash("sha256");

  for (
    const file of
    files
  ) {
    digest.update(
      file.path,
      "utf8",
    );

    digest.update(
      Buffer.from([
        0,
      ]),
    );

    digest.update(
      file.bytes,
    );

    digest.update(
      Buffer.from([
        0,
      ]),
    );
  }

  return digest.digest(
    "hex",
  );
}

/**
 * Revalidates the runner response at the ZoeBuild persistence boundary.
 *
 * The runner is trusted infrastructure, but deployment persistence still
 * verifies identity, paths, byte limits, exact base64 and the content hash.
 * This prevents a malformed or stale service response from becoming durable.
 */
export function validateProductionBuildExecutionArtifact(
  input: Readonly<{
    buildProjectId: string;
    sourceVersion: number;
    execution:
      ProductionBuildExecutionResponseV1;
  }>,
): ValidatedProductionArtifact {
  const buildProjectId =
    input.buildProjectId.trim();

  if (
    !buildProjectId ||
    !Number.isSafeInteger(
      input.sourceVersion,
    ) ||
    input.sourceVersion < 1
  ) {
    return invalid(
      "Invalid compiled artifact target.",
    );
  }

  const result =
    input.execution.result;

  if (
    input.execution.ok !==
      true ||
    result.protocolVersion !==
      BUILD_EXECUTOR_PROTOCOL_VERSION ||
    result.operation !==
      "production-build" ||
    result.buildProjectId !==
      buildProjectId ||
    result.sourceVersion !==
      input.sourceVersion
  ) {
    return invalid(
      "Production-build result does not match the requested source version.",
    );
  }

  const artifact =
    result.artifact;

  if (
    artifact.type !==
      "static-directory" ||
    artifact.outputPath !==
      "dist" ||
    !Array.isArray(
      artifact.files,
    ) ||
    artifact.files.length < 1 ||
    artifact.files.length >
      PRODUCTION_BUILD_ARTIFACT_LIMITS
        .files ||
    !Number.isSafeInteger(
      artifact.totalBytes,
    ) ||
    artifact.totalBytes < 0 ||
    artifact.totalBytes >
      PRODUCTION_BUILD_ARTIFACT_LIMITS
        .totalBytes ||
    !/^[a-f0-9]{64}$/.test(
      artifact.sha256,
    )
  ) {
    return invalid(
      "Production-build artifact metadata is invalid.",
    );
  }

  const seen =
    new Set<string>();

  const files:
    ValidatedProductionArtifactFile[] =
      [];

  let totalBytes = 0;

  for (
    const file of
    artifact.files
  ) {
    const path =
      safeArtifactPath(
        file.path,
      );

    if (
      seen.has(path)
    ) {
      return invalid(
        "Production-build artifact contains duplicate file paths.",
      );
    }

    seen.add(path);

    if (
      file.encoding !==
        "base64" ||
      typeof file.data !==
        "string"
    ) {
      return invalid(
        "Production-build files must use base64 encoding.",
      );
    }

    const bytes =
      Buffer.from(
        file.data,
        "base64",
      );

    if (
      bytes.toString(
        "base64",
      ) !==
      file.data
    ) {
      return invalid(
        "Production-build artifact contains non-canonical base64.",
      );
    }

    if (
      bytes.byteLength >
      PRODUCTION_BUILD_ARTIFACT_LIMITS
        .fileBytes
    ) {
      return invalid(
        "Production-build artifact exceeds the per-file byte limit.",
      );
    }

    totalBytes +=
      bytes.byteLength;

    if (
      totalBytes >
      PRODUCTION_BUILD_ARTIFACT_LIMITS
        .totalBytes
    ) {
      return invalid(
        "Production-build artifact exceeds the total byte limit.",
      );
    }

    /**
     * Prisma 7.8 Bytes expects an ArrayBuffer-backed Uint8Array.
     *
     * Node Buffer exposes ArrayBufferLike because it can theoretically be
     * backed by SharedArrayBuffer. Copy into a fresh Uint8Array so the
     * persistence boundary owns ordinary ArrayBuffer-backed bytes.
     */
    const durableBytes =
      new Uint8Array(
        bytes.byteLength,
      );

    durableBytes.set(
      bytes,
    );

    files.push({
      path,
      bytes:
        durableBytes,
    });
  }

  files.sort(
    (a, b) =>
      a.path.localeCompare(
        b.path,
      ),
  );

  if (
    !files.some(
      (file) =>
        file.path ===
        "index.html",
    )
  ) {
    return invalid(
      "Production-build artifact requires index.html.",
    );
  }

  if (
    totalBytes !==
      artifact.totalBytes
  ) {
    return invalid(
      "Production-build total byte count does not match the files.",
    );
  }

  const artifactHash =
    digestFiles(files);

  if (
    artifactHash !==
      artifact.sha256
  ) {
    return invalid(
      "Production-build artifact hash does not match its files.",
    );
  }

  return {
    artifactHash,
    totalBytes,
    files,
  };
}

export type PublishCompiledBuildInput =
  Readonly<{
    ownerId: string;
    buildProjectId: string;
    expectedSourceVersion:
      number;
    stackId: string;
    templateId: string;
    publicOrigin: string;
    execution:
      ProductionBuildExecutionResponseV1;
  }>;

export type PublishCompiledBuildResult =
  Readonly<{
    deploymentId: string;
    artifactId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    reused: boolean;
  }>;

/**
 * PostgreSQL is the initial V1 compiled-artifact backend.
 *
 * It is hidden behind this provider boundary so the artifact bytes can move
 * to R2/S3 later without changing CodeProject source authority or the browser
 * publish contract.
 */
export function createPrismaSelfHostedCompiledPublisher(
  client: PrismaClient,
) {
  return {
    async publishOwnedProject(
      input:
        PublishCompiledBuildInput,
    ): Promise<
      PublishCompiledBuildResult
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
        throw new CompiledBuildPublishError(
          "BUILD_PUBLISH_NOT_FOUND",
          "Invalid publish target.",
        );
      }

      const publicOrigin =
        new URL(
          input.publicOrigin,
        );

      const validated =
        validateProductionBuildExecutionArtifact({
          buildProjectId,
          sourceVersion:
            input
              .expectedSourceVersion,
          execution:
            input.execution,
        });

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
            throw new CompiledBuildPublishError(
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
            throw new CompiledBuildPublishError(
              "BUILD_PUBLISH_SOURCE_CHANGED",
              "Project source changed while building. Publish the latest saved version.",
            );
          }

          const codeProject =
            buildProject
              .codeProject;

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
            throw new CompiledBuildPublishError(
              "BUILD_PUBLISH_REVISION_INVALID",
              "The immutable source revision does not match the current source head.",
            );
          }

          /**
           * Same publication-snapshot policy as direct-static publishing.
           * A metadata-only source version may not already have a revision.
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

                    compiledArtifact:
                      true,
                  },

                  createdById:
                    ownerId,
                },
              });
          }

          const uniqueWhere = {
            buildProjectId_sourceVersion_artifactHash:
              {
                buildProjectId:
                  buildProject.id,

                sourceVersion:
                  input
                    .expectedSourceVersion,

                artifactHash:
                  validated
                    .artifactHash,
              },
          } as const;

          const existingArtifact =
            await tx
              .buildArtifact
              .findUnique({
                where:
                  uniqueWhere,

                select: {
                  id: true,

                  kind: true,

                  outputPath:
                    true,

                  provider:
                    true,

                  fileCount:
                    true,

                  totalBytes:
                    true,
                },
              });

          const artifact =
            await tx
              .buildArtifact
              .upsert({
                where:
                  uniqueWhere,

                update: {},

                create: {
                  buildProjectId:
                    buildProject.id,

                  sourceVersion:
                    input
                      .expectedSourceVersion,

                  kind:
                    "static-directory",

                  outputPath:
                    "dist",

                  provider:
                    ZOEBUILD_COMPILED_ARTIFACT_PROVIDER,

                  artifactHash:
                    validated
                      .artifactHash,

                  fileCount:
                    validated
                      .files.length,

                  totalBytes:
                    validated
                      .totalBytes,

                  files: {
                    create:
                      validated
                        .files
                        .map(
                          (
                            file,
                          ) => ({
                            path:
                              file.path,

                            content:
                              file.bytes,

                            sizeBytes:
                              file
                                .bytes
                                .byteLength,
                          }),
                        ),
                  },
                },

                select: {
                  id: true,

                  kind: true,

                  outputPath:
                    true,

                  provider:
                    true,

                  artifactHash:
                    true,

                  fileCount:
                    true,

                  totalBytes:
                    true,
                },
              });

          if (
            artifact.kind !==
              "static-directory" ||
            artifact.outputPath !==
              "dist" ||
            artifact.provider !==
              ZOEBUILD_COMPILED_ARTIFACT_PROVIDER ||
            artifact.fileCount !==
              validated
                .files.length ||
            artifact.totalBytes !==
              validated
                .totalBytes
          ) {
            throw new CompiledBuildPublishError(
              "BUILD_PUBLISH_ARTIFACT_INVALID",
              "Stored compiled artifact metadata does not match the runner output.",
            );
          }

          const existingDeployment =
            await tx
              .buildDeployment
              .findFirst({
                where: {
                  buildProjectId:
                    buildProject.id,

                  buildArtifactId:
                    artifact.id,

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
                    validated
                      .artifactHash,
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

              artifactId:
                artifact.id,

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

                  buildArtifactId:
                    artifact.id,

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
                    `artifact:${artifact.id}`,

                  status:
                    "ready",

                  hostname:
                    publicOrigin
                      .hostname,

                  artifactHash:
                    validated
                      .artifactHash,

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
                        "dist",
                    },

                    artifactStorage: {
                      provider:
                        ZOEBUILD_COMPILED_ARTIFACT_PROVIDER,

                      artifactId:
                        artifact.id,
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
            throw new CompiledBuildPublishError(
              "BUILD_PUBLISH_ARTIFACT_INVALID",
              "Deployment persistence did not return a complete compiled deployment.",
            );
          }

          return {
            deploymentId:
              deployment.id,

            artifactId:
              artifact.id,

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

            reused:
              Boolean(
                existingArtifact,
              ),
          };
        },
      );
    },
  };
}
