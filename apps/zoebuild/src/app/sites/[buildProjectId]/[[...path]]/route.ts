import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  getNativeCommerceProduct,
  listNativeCommerceProducts,
  NativeCommerceCatalogInputError,
} from "@/lib/commerce/nativeCommerceCatalog";

import {
  buildPublishedStaticFileMap,
  publishedStaticContentType,
  resolvePublishedStaticFile,
} from "@/lib/build/staticPublishedArtifact";

import {
  isPublishedSiteOriginRequest,
} from "@/lib/build/publishOrigins";

import {
  ZOEBUILD_SELF_HOSTED_PROVIDER,
  ZOEBUILD_STATIC_ASSETS_KIND,
} from "@/lib/build/publishBuildProject";

import {
  ZOEBUILD_COMPILED_ARTIFACT_PROVIDER,
} from "@/lib/build/compiledBuildPublisher";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

function notFound() {
  return new Response(
    "Not found.",
    {
      status: 404,

      headers: {
        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function unavailable() {
  return new Response(
    "Published source is unavailable.",
    {
      status: 503,

      headers: {
        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function responseForPublishedFile(
  input: Readonly<{
    request: Request;
    deploymentId:
      string;
    sourceVersion:
      number;
    artifactHash:
      string | null;
    body:
      | string
      | Uint8Array;
    contentType:
      string;
  }>,
) {
  const etag =
    `"${input.artifactHash ?? input.deploymentId}"`;

  const headers =
    new Headers({
      "Content-Type":
        input.contentType,

      "Cache-Control":
        "public, max-age=0, must-revalidate",

      ETag:
        etag,

      "X-Content-Type-Options":
        "nosniff",

      "Referrer-Policy":
        "strict-origin-when-cross-origin",

      "X-ZoeBuild-Deployment":
        input.deploymentId,

      "X-ZoeBuild-Source-Version":
        String(
          input.sourceVersion,
        ),
    });

  if (
    input.request.headers.get(
      "if-none-match",
    ) === etag
  ) {
    return new Response(
      null,
      {
        status: 304,
        headers,
      },
    );
  }

  const responseBody:
    | string
    | ArrayBuffer =
    typeof input.body ===
      "string"
      ? input.body
      : Uint8Array.from(
          input.body,
        ).buffer;

  return new Response(
    responseBody,
    {
      status: 200,
      headers,
    },
  );
}

export async function GET(
  request: Request,

  ctx: {
    params:
      Promise<{
        buildProjectId:
          string;

        path?:
          string[];
      }>;
  },
) {
  if (
    !isPublishedSiteOriginRequest(
      request,
    )
  ) {
    return notFound();
  }

  const {
    buildProjectId,
    path = [],
  } = await ctx.params;

  const normalizedProjectId =
    buildProjectId.trim();

  if (
    !normalizedProjectId
  ) {
    return notFound();
  }

  const deployment =
    await prisma
      .buildDeployment
      .findFirst({
        where: {
          buildProjectId:
            normalizedProjectId,

          environment:
            "production",

          kind:
            ZOEBUILD_STATIC_ASSETS_KIND,

          provider:
            ZOEBUILD_SELF_HOSTED_PROVIDER,

          status:
            "ready",

          buildProject: {
            status: {
              not:
                "archived",
            },

            codeProject: {
              archivedAt:
                null,
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

          buildProject: {
            select: {
              codeProjectId:
                true,
            },
          },

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

  if (!deployment) {
    return notFound();
  }

  const requestedPath =
    path.join("/");

  if (
    requestedPath ===
    "__zoebuild/commerce/products"
  ) {
    const url =
      new URL(
        request.url,
      );

    try {
      const id =
        url.searchParams.get(
          "id",
        );
      const slug =
        url.searchParams.get(
          "slug",
        );

      const payload =
        id || slug
          ? {
              ok: true,
              product:
                await getNativeCommerceProduct(
                  prisma,
                  {
                    buildProjectId:
                      normalizedProjectId,
                    surface:
                      "published",
                    id,
                    slug,
                  },
                ),
            }
          : {
              ok: true,
              products:
                await listNativeCommerceProducts(
                  prisma,
                  {
                    buildProjectId:
                      normalizedProjectId,
                    surface:
                      "published",
                    first:
                      url.searchParams.get(
                        "first",
                      ),
                  },
                ),
            };

      return new Response(
        JSON.stringify(
          payload,
        ),
        {
          status: 200,
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
            "Content-Type":
              "application/json; charset=utf-8",
            "X-Content-Type-Options":
              "nosniff",
            "Referrer-Policy":
              "strict-origin-when-cross-origin",
            "X-ZoeBuild-Deployment":
              deployment.id,
            "X-ZoeBuild-Source-Version":
              String(
                deployment.sourceVersion,
              ),
          },
        },
      );
    } catch (error) {
      if (
        error instanceof
        NativeCommerceCatalogInputError
      ) {
        return new Response(
          error.message,
          {
            status: 400,
            headers: {
              "Cache-Control":
                "no-store",
              "Content-Type":
                "text/plain; charset=utf-8",
              "X-Content-Type-Options":
                "nosniff",
            },
          },
        );
      }

      throw error;
    }
  }

  const acceptsHtml =
    (
      request.headers.get(
        "accept",
      ) ?? ""
    ).includes(
      "text/html",
    );

  /**
   * Compiled React/Vite deployment:
   *
   * Load only path metadata first, reuse the canonical static route resolver,
   * then fetch exactly one BYTEA file. We intentionally do not load the whole
   * <=4 MiB artifact for every CSS/JS/image request.
   */
  if (
    deployment
      .buildArtifact
  ) {
    const artifact =
      deployment
        .buildArtifact;

    if (
      artifact.provider !==
        ZOEBUILD_COMPILED_ARTIFACT_PROVIDER ||
      artifact.kind !==
        "static-directory" ||
      artifact.outputPath !==
        "dist" ||
      artifact.artifactHash !==
        deployment
          .artifactHash
    ) {
      console.error(
        "[ZoeBuild published site] compiled artifact metadata mismatch",
        {
          deploymentId:
            deployment.id,

          artifactId:
            artifact.id,
        },
      );

      return unavailable();
    }

    const availablePaths =
      await prisma
        .buildArtifactFile
        .findMany({
          where: {
            artifactId:
              artifact.id,
          },

          select: {
            path: true,
          },
        });

    const available =
      new Map(
        availablePaths.map(
          (entry) => [
            entry.path,

            {
              path:
                entry.path,

              body: "",

              contentType:
                publishedStaticContentType(
                  entry.path,
                ),
            },
          ],
        ),
      );

    let resolved;

    try {
      resolved =
        resolvePublishedStaticFile(
          available,
          requestedPath,
          acceptsHtml,
        );
    } catch {
      return notFound();
    }

    if (!resolved) {
      return notFound();
    }

    const compiledFile =
      await prisma
        .buildArtifactFile
        .findUnique({
          where: {
            artifactId_path: {
              artifactId:
                artifact.id,

              path:
                resolved.path,
            },
          },

          select: {
            path: true,
            content: true,
          },
        });

    if (!compiledFile) {
      console.error(
        "[ZoeBuild published site] compiled artifact file missing",
        {
          deploymentId:
            deployment.id,

          artifactId:
            artifact.id,

          path:
            resolved.path,
        },
      );

      return unavailable();
    }

    return responseForPublishedFile({
      request,

      deploymentId:
        deployment.id,

      sourceVersion:
        deployment
          .sourceVersion,

      artifactHash:
        deployment
          .artifactHash,

      body:
        compiledFile
          .content,

      contentType:
        publishedStaticContentType(
          compiledFile.path,
        ),
    });
  }

  /**
   * Direct-static deployment:
   *
   * Preserve the existing immutable CodeProjectRevision source path.
   */
  const revision =
    await prisma
      .codeProjectRevision
      .findUnique({
        where: {
          projectId_version: {
            projectId:
              deployment
                .buildProject
                .codeProjectId,

            version:
              deployment
                .sourceVersion,
          },
        },

        select: {
          snapshot:
            true,
        },
      });

  if (!revision) {
    console.error(
      "[ZoeBuild published site] immutable revision missing",
      {
        deploymentId:
          deployment.id,

        buildProjectId:
          normalizedProjectId,

        sourceVersion:
          deployment
            .sourceVersion,
      },
    );

    return unavailable();
  }

  let files;

  try {
    files =
      buildPublishedStaticFileMap(
        revision.snapshot,
      );
  } catch (error) {
    console.error(
      "[ZoeBuild published site] invalid immutable workspace",
      {
        deploymentId:
          deployment.id,

        error,
      },
    );

    return unavailable();
  }

  let file;

  try {
    file =
      resolvePublishedStaticFile(
        files,
        requestedPath,
        acceptsHtml,
      );
  } catch {
    return notFound();
  }

  if (!file) {
    return notFound();
  }

  return responseForPublishedFile({
    request,

    deploymentId:
      deployment.id,

    sourceVersion:
      deployment
        .sourceVersion,

    artifactHash:
      deployment
        .artifactHash,

    body:
      file.body,

    contentType:
      file.contentType,
  });
}
