import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  NativeCommerceCatalogInputError,
} from "@/lib/commerce/nativeCommerceCatalog";
import {
  NativeCommerceCartError,
  parseNativeCommerceCartCommand,
} from "@/lib/commerce/nativeCommerceCart";
import {
  NativeCommerceCheckoutError,
  parseCommerceCheckoutRequest,
} from "@/lib/commerce/nativeCommerceCheckout";
import {
  enforceNativeCommerceCartRateLimit,
} from "@/lib/commerce/nativeCommerceCartRateLimit";
import {
  CommerceProviderResolutionError,
} from "@/lib/commerce/commerceProviderResolver";
import {
  beginCommerceCheckout,
  executeCommerceCartCommand,
  getCommerceProduct,
  listCommerceProducts,
} from "@/lib/commerce/commerceRuntime";
import { trustedCommerceBuyerIpFromRequest } from "@/lib/commerce/trustedCommerceBuyerIp";

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


async function readPublishedCommerceJson(
  request: Request,
) {
  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType
      .toLowerCase()
      .startsWith(
        "application/json",
      )
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_CONTENT_TYPE_INVALID",
      "Commerce requests require application/json.",
      415,
    );
  }

  const raw =
    await request.text();

  if (
    raw.length >
    16_384
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_REQUEST_TOO_LARGE",
      "Commerce request body is too large.",
      413,
    );
  }

  try {
    return JSON.parse(
      raw,
    ) as unknown;
  } catch {
    throw new NativeCommerceCartError(
      "COMMERCE_REQUEST_INVALID",
      "Invalid commerce request.",
      400,
    );
  }
}

export async function POST(
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

  const commercePath =
    path.join("/");

  const isCartPath =
    commercePath ===
      "__zoebuild/commerce/cart";

  const isCheckoutPath =
    commercePath ===
      "__zoebuild/commerce/checkout";

  if (
    !normalizedProjectId ||
    (
      !isCartPath &&
      !isCheckoutPath
    )
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
        },
      });

  if (!deployment) {
    return notFound();
  }

  const cartRateLimit =
    await enforceNativeCommerceCartRateLimit(
      request,
      {
        buildProjectId:
          normalizedProjectId,
        scope:
          "published",
      },
    );

  if (
    !cartRateLimit.ok
  ) {
    if (
      cartRateLimit.kind ===
      "limited"
    ) {
      return new Response(
        "Too many cart requests.",
        {
          status: 429,
          headers: {
            "Cache-Control":
              "no-store",
            "Content-Type":
              "text/plain; charset=utf-8",
            "Retry-After":
              String(
                cartRateLimit.retryAfterSeconds ??
                  60,
              ),
            "X-Content-Type-Options":
              "nosniff",
          },
        },
      );
    }

    return new Response(
      "Commerce service unavailable.",
      {
        status: 503,
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

  try {
    if (
      isCheckoutPath
    ) {
      const checkout =
        await beginCommerceCheckout(
          prisma,
          {
            buildProjectId:
              normalizedProjectId,
            surface:
              "published",
            request:
              parseCommerceCheckoutRequest(
                await readPublishedCommerceJson(
                  request,
                ),
              ),
          },
          trustedCommerceBuyerIpFromRequest(request),
        );

      return new Response(
        JSON.stringify({
          ok:
            true,
          checkout,
        }),
        {
          status:
            200,
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
    }


    const command =
      parseNativeCommerceCartCommand(
        await readPublishedCommerceJson(
          request,
        ),
      );

    const cart =
      await executeCommerceCartCommand(
        prisma,
        {
          buildProjectId:
            normalizedProjectId,
          surface:
            "published",
          command,
        },
        trustedCommerceBuyerIpFromRequest(request) ?? undefined,
      );

    return new Response(
      JSON.stringify({
        ok: true,
        cart,
      }),
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
      NativeCommerceCheckoutError
    ) {
      return new Response(
        error.message,
        {
          status:
            error.status,
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

    if (
      error instanceof
      CommerceProviderResolutionError
    ) {
      return new Response(
        "Commerce service unavailable.",
        {
          status: 503,
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

    if (
      error instanceof
      NativeCommerceCartError
    ) {
      return new Response(
        error.message,
        {
          status:
            error.status,
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

    console.error(
      "[ZoeBuild published commerce cart] failed",
      {
        buildProjectId:
          normalizedProjectId,
        error,
      },
    );

    return new Response(
      "Commerce service unavailable.",
      {
        status: 503,
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
                await getCommerceProduct(
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
                await listCommerceProducts(
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

      if (
        error instanceof
        CommerceProviderResolutionError
      ) {
        return new Response(
          "Commerce service unavailable.",
          {
            status: 503,
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
