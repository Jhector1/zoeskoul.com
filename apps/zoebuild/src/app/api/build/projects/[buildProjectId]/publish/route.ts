import {
  NextResponse,
} from "next/server";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import {
  BuildPreparationError,
  createRegisteredProductionBuildJob,
  prepareRegisteredBuildArtifactPlan,
} from "@zoeskoul/build-preparation";

import {
  enforceSameOriginPost,
} from "@zoeskoul/platform-server/http";

import {
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";

import {
  createPrismaBuildProjectReader,
} from "@/lib/build/readBuildProjects";

import {
  BuildPublishPersistenceError,
  createPrismaSelfHostedStaticPublisher,
  ZOEBUILD_SELF_HOSTED_PROVIDER,
  ZOEBUILD_STATIC_ASSETS_KIND,
} from "@/lib/build/publishBuildProject";

import {
  CompiledBuildPublishError,
  createPrismaSelfHostedCompiledPublisher,
  ZOEBUILD_COMPILED_ARTIFACT_PROVIDER,
} from "@/lib/build/compiledBuildPublisher";

import {
  executeTrustedProductionBuildAtRunner,
} from "@/lib/build/buildExecutorValidation";

import {
  isZoeBuildPublishEnabled,
  resolveZoeBuildPublishedSiteOrigin,
} from "@/lib/build/publishOrigins";
import {
  buildZoeBuildPublishedSiteUrl,
} from "@/lib/build/publishedDeploymentStatus";

import {
  requireRunnerActorKey,
} from "@/lib/server/runnerActorKey";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

function json(
  requestId: string,
  body:
    Record<
      string,
      unknown
    >,
  status = 200,
) {
  const response =
    NextResponse.json(
      {
        ...body,
        requestId,
      },
      {
        status,
      },
    );

  response.headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );

  response.headers.set(
    "X-Request-Id",
    requestId,
  );

  return response;
}

async function enforceProductionBuildRateLimit(
  input: Readonly<{
    requestId: string;
    userId: string;
    buildProjectId: string;
  }>,
) {
  const limited =
    await rateLimit(
      `zoebuild-production-build:${input.userId}:${input.buildProjectId}`,
      {
        bucket:
          "zoebuild-production-build",

        limit: 12,

        window:
          "1 h",
      },
    ).catch(
      (error) => {
        console.error(
          "[/api/build/projects/:buildProjectId/publish] production-build rate limit unavailable",
          {
            requestId:
              input.requestId,

            buildProjectId:
              input.buildProjectId,

            error,
          },
        );

        return null;
      },
    );

  return limited;
}

export async function POST(
  req: Request,

  ctx: {
    params:
      Promise<{
        buildProjectId:
          string;
      }>;
  },
) {
  const requestId =
    crypto.randomUUID();

  if (
    !enforceSameOriginPost(
      req,
    )
  ) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_FORBIDDEN",

        message:
          "Forbidden.",
      },
      403,
    );
  }

  const access =
    await loadCurrentBuildAccessSnapshot();

  const userId =
    access.userId ?? "";

  if (!userId) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_AUTH_REQUIRED",

        message:
          "Unauthorized.",
      },
      401,
    );
  }

  if (
    !isZoeBuildPublishEnabled()
  ) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_PUBLISH_DISABLED",

        message:
          "Publishing is not enabled for this deployment.",
      },
      503,
    );
  }

  const {
    buildProjectId,
  } = await ctx.params;

  const limited =
    await rateLimit(
      `zoebuild-publish:${userId}:${buildProjectId}`,
      {
        bucket:
          "zoebuild-publish",

        limit: 30,

        window:
          "1 h",
      },
    ).catch(
      (error) => {
        console.error(
          "[/api/build/projects/:buildProjectId/publish] rate limit unavailable",
          {
            requestId,
            buildProjectId,
            error,
          },
        );

        return null;
      },
    );

  if (!limited) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_SERVICE_UNAVAILABLE",

        message:
          "Service unavailable.",
      },
      503,
    );
  }

  if (!limited.ok) {
    const response =
      json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_RATE_LIMITED",

          message:
            "Too many publish requests.",
        },
        429,
      );

    response.headers.set(
      "Retry-After",
      String(
        Math.max(
          1,

          Math.ceil(
            (
              limited.resetMs -
              Date.now()
            ) / 1000,
          ),
        ),
      ),
    );

    return response;
  }

  try {
    const project =
      await getBuildProjectCommand({
        access,

        buildProjectId,

        reader:
          createPrismaBuildProjectReader(
            prisma,
          ),
      });

    if (!project) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_PROJECT_NOT_FOUND",

          message:
            "Project not found.",
        },
        404,
      );
    }

    if (
      !project.specification
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_PUBLISH_INVALID",

          message:
            "Project specification is unavailable.",
        },
        409,
      );
    }

    const preparation =
      prepareRegisteredBuildArtifactPlan({
        specification:
          project.specification,

        workspace:
          project.workspace,

        sourceVersion:
          project.sourceVersion,
      });

    if (
      !preparation.buildReady
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_PUBLISH_NOT_READY",

          message:
            "Project source is not ready to publish.",
        },
        409,
      );
    }

    const directStatic =
      preparation
        .buildCommand
        .length === 0 &&
      preparation
        .artifact
        .type ===
        "static-directory" &&
      preparation
        .artifact
        .outputPath ===
        "." &&
      preparation
        .deploymentAdapterId ===
        ZOEBUILD_STATIC_ASSETS_KIND;

    const trustedReact =
      preparation.stackId ===
        "react-vite-v1" &&
      preparation.templateId ===
        "react-vite-v1" &&
      preparation
        .buildCommand
        .length === 2 &&
      preparation
        .buildCommand[0] ===
        "pnpm" &&
      preparation
        .buildCommand[1] ===
        "build" &&
      preparation
        .artifact
        .type ===
        "static-directory" &&
      preparation
        .artifact
        .outputPath ===
        "dist" &&
      preparation
        .deploymentAdapterId ===
        ZOEBUILD_STATIC_ASSETS_KIND;

    if (
      !directStatic &&
      !trustedReact
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_PUBLISH_UNSUPPORTED",

          message:
            "This project does not have a registered production publishing path.",
        },
        409,
      );
    }

    const publicOrigin =
      resolveZoeBuildPublishedSiteOrigin();

    let deployment:
      Readonly<{
        deploymentId:
          string;

        sourceVersion:
          number;

        artifactHash:
          string;

        deployedAt:
          string;

        reused:
          boolean;

        artifactId?:
          string;
      }>;

    if (
      directStatic
    ) {
      const publisher =
        createPrismaSelfHostedStaticPublisher(
          prisma,
        );

      deployment =
        await publisher
          .publishOwnedProject({
            ownerId:
              userId,

            buildProjectId:
              project
                .buildProjectId,

            expectedSourceVersion:
              project
                .sourceVersion,

            stackId:
              preparation
                .stackId,

            templateId:
              preparation
                .templateId,

            publicOrigin,
          });
    } else {
      /**
       * Cost guard:
       * Re-publishing the exact same source version must not pay for another
       * install/build container run when a ready immutable compiled deployment
       * already exists.
       */
      const reusableCompiledDeployment =
        await prisma
          .buildDeployment
          .findFirst({
            where: {
              buildProjectId:
                project
                  .buildProjectId,

              sourceVersion:
                project
                  .sourceVersion,

              environment:
                "production",

              kind:
                ZOEBUILD_STATIC_ASSETS_KIND,

              provider:
                ZOEBUILD_SELF_HOSTED_PROVIDER,

              status:
                "ready",

              buildArtifactId: {
                not:
                  null,
              },

              buildProject: {
                codeProject: {
                  ownerId:
                    userId,

                  archivedAt:
                    null,

                  currentVersion:
                    project
                      .sourceVersion,
                },
              },
            },

            orderBy: [
              {
                deployedAt:
                  "desc",
              },

              {
                createdAt:
                  "desc",
              },
            ],

            select: {
              id: true,

              sourceVersion:
                true,

              artifactHash:
                true,

              deployedAt:
                true,

              buildArtifact: {
                select: {
                  id: true,

                  provider:
                    true,

                  kind:
                    true,

                  outputPath:
                    true,

                  artifactHash:
                    true,
                },
              },
            },
          });

      if (
        reusableCompiledDeployment
          ?.artifactHash &&
        reusableCompiledDeployment
          .deployedAt &&
        reusableCompiledDeployment
          .buildArtifact &&
        reusableCompiledDeployment
          .buildArtifact
          .provider ===
          ZOEBUILD_COMPILED_ARTIFACT_PROVIDER &&
        reusableCompiledDeployment
          .buildArtifact
          .kind ===
          "static-directory" &&
        reusableCompiledDeployment
          .buildArtifact
          .outputPath ===
          "dist" &&
        reusableCompiledDeployment
          .buildArtifact
          .artifactHash ===
          reusableCompiledDeployment
            .artifactHash
      ) {
        deployment = {
          deploymentId:
            reusableCompiledDeployment
              .id,

          artifactId:
            reusableCompiledDeployment
              .buildArtifact
              .id,

          sourceVersion:
            reusableCompiledDeployment
              .sourceVersion,

          artifactHash:
            reusableCompiledDeployment
              .artifactHash,

          deployedAt:
            reusableCompiledDeployment
              .deployedAt
              .toISOString(),

          reused:
            true,
        };
      } else {
        const buildLimited =
          await enforceProductionBuildRateLimit({
            requestId,
            userId,

            buildProjectId:
              project
                .buildProjectId,
          });

        if (!buildLimited) {
          return json(
            requestId,
            {
              ok: false,

              code:
                "BUILD_SERVICE_UNAVAILABLE",

              message:
                "Production build service is unavailable.",
            },
            503,
          );
        }

        if (
          !buildLimited.ok
        ) {
          const response =
            json(
              requestId,
              {
                ok: false,

                code:
                  "BUILD_BUILD_RATE_LIMITED",

                message:
                  "Too many production builds for this project.",
              },
              429,
            );

          response.headers.set(
            "Retry-After",
            String(
              Math.max(
                1,

                Math.ceil(
                  (
                    buildLimited
                      .resetMs -
                    Date.now()
                  ) / 1000,
                ),
              ),
            ),
          );

          return response;
        }

        const actorKey =
          await requireRunnerActorKey(
            userId,
          );

        const buildRequest =
          createRegisteredProductionBuildJob({
            buildProjectId:
              project
                .buildProjectId,

            specification:
              project
                .specification,

            workspace:
              project
                .workspace,

            sourceVersion:
              project
                .sourceVersion,
          });

        let execution;

        try {
          execution =
            await executeTrustedProductionBuildAtRunner({
              actorKey,

              request:
                buildRequest,
            });
        } catch (error) {
          console.error(
            "[/api/build/projects/:buildProjectId/publish] trusted production build failed",
            {
              requestId,

              buildProjectId:
                project
                  .buildProjectId,

              sourceVersion:
                project
                  .sourceVersion,

              error,
            },
          );

          return json(
            requestId,
            {
              ok: false,

              code:
                "BUILD_PUBLISH_EXECUTOR_FAILED",

              message:
                "The trusted production build failed.",
            },
            502,
          );
        }

        const publisher =
          createPrismaSelfHostedCompiledPublisher(
            prisma,
          );

        deployment =
          await publisher
            .publishOwnedProject({
              ownerId:
                userId,

              buildProjectId:
                project
                  .buildProjectId,

              expectedSourceVersion:
                project
                  .sourceVersion,

              stackId:
                preparation
                  .stackId,

              templateId:
                preparation
                  .templateId,

              publicOrigin,

              execution,
            });
      }
    }

    return json(
      requestId,
      {
        ok: true,

        deployment: {
          ...deployment,

          publicUrl:
            buildZoeBuildPublishedSiteUrl(
              publicOrigin,

              project
                .buildProjectId,
            ),
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      BuildPublishPersistenceError ||
      error instanceof
      CompiledBuildPublishError
    ) {
      const status =
        error.code ===
        "BUILD_PUBLISH_NOT_FOUND"
          ? 404
          : 409;

      return json(
        requestId,
        {
          ok: false,

          code:
            error.code,

          message:
            error.message,
        },
        status,
      );
    }

    if (
      error instanceof
      BuildPreparationError
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            error.code,

          message:
            error.message,
        },
        409,
      );
    }

    if (
      error instanceof
      BuildAccessError
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            error.code,

          message:
            error.message,
        },
        error.code ===
          "BUILD_AUTH_REQUIRED"
          ? 401
          : 403,
      );
    }

    if (
      error instanceof
      BuildProjectDefinitionError
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            error.code,

          message:
            error.message,
        },
        400,
      );
    }

    console.error(
      "[/api/build/projects/:buildProjectId/publish] failed",
      {
        requestId,
        buildProjectId,
        userId,
        error,
      },
    );

    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_PUBLISH_FAILED",

        message:
          "Project could not be published.",
      },
      500,
    );
  }
}
