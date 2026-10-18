import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import {
  proxyFetchTrustedReactPreviewAtRunner,
  resolveTrustedReactPreviewCapabilityAtRunner,
} from "@/lib/build/reactPreviewRunnerClient";
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
import { prisma } from "@zoeskoul/platform-server/prisma";
import {
  parseReactPreviewId,
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import {
  normalizeReactPreviewProxyPath,
} from "@/lib/build/reactPreviewProxyPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function validCapability(value: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

async function proxy(
  req: Request,
  ctx: {
    params: Promise<{
      buildProjectId: string;
      previewId: string;
      capability: string;
      path?: string[];
    }>;
  },
  method: "GET" | "HEAD",
) {
  const { buildProjectId, previewId: rawPreviewId, capability } = await ctx.params;

  try {
    const previewId = parseReactPreviewId(rawPreviewId);
    if (!validCapability(capability)) {
      return errorResponse("Invalid preview capability.", 404);
    }

    const url = new URL(req.url);
    const basePath =
      `/api/build/projects/${encodeURIComponent(buildProjectId)}` +
      `/preview/${encodeURIComponent(previewId)}` +
      `/content/${encodeURIComponent(capability)}/`;

    const normalizedPathname = normalizeReactPreviewProxyPath({
      pathname: url.pathname,
      basePath,
    });

    if (!normalizedPathname) {
      return errorResponse("Invalid preview path.", 404);
    }

    const relativePath =
      normalizedPathname.slice(
        basePath.length,
      );

    if (
      relativePath ===
      "__zoebuild/commerce/products"
    ) {
      const context =
        await resolveTrustedReactPreviewCapabilityAtRunner({
          previewId,
          path:
            normalizedPathname,
        });

      if (
        context.buildProjectId !==
        buildProjectId
      ) {
        return errorResponse(
          "Preview capability does not match this project.",
          404,
        );
      }

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
                        context.buildProjectId,
                      surface:
                        "preview",
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
                        context.buildProjectId,
                      surface:
                        "preview",
                      first:
                        url.searchParams.get(
                          "first",
                        ),
                    },
                  ),
              };

        const headers =
          new Headers({
            "Access-Control-Allow-Origin":
              "*",
            "Cross-Origin-Resource-Policy":
              "cross-origin",
            "Cache-Control":
              "no-store, max-age=0",
            "Content-Type":
              "application/json; charset=utf-8",
            "X-Content-Type-Options":
              "nosniff",
            "Referrer-Policy":
              "no-referrer",
          });

        return new Response(
          method === "HEAD"
            ? null
            : JSON.stringify(
                payload,
              ),
          {
            status: 200,
            headers,
          },
        );
      } catch (error) {
        if (
          error instanceof
          NativeCommerceCatalogInputError
        ) {
          return errorResponse(
            error.message,
            400,
          );
        }

        if (
          error instanceof
          CommerceProviderResolutionError
        ) {
          return errorResponse(
            "Commerce service unavailable.",
            503,
          );
        }

        throw error;
      }
    }

    const result = await proxyFetchTrustedReactPreviewAtRunner({
      previewId,
      path: `${normalizedPathname}${url.search}`,
      method,
    });

    const headers = new Headers();
    const contentType = result.headers["content-type"];
    if (contentType) headers.set("Content-Type", contentType);
    const etag = result.headers.etag;
    if (etag) headers.set("ETag", etag);
    const location = result.headers.location;
    if (location && location.startsWith(basePath)) headers.set("Location", location);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");

    const body =
      method === "HEAD"
        ? null
        : new Uint8Array(Buffer.from(result.bodyBase64, "base64"));

    return new Response(body, { status: result.status, headers });
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return errorResponse(error.message, error.status);
    }
    if (error instanceof RunnerHttpError) {
      return errorResponse(
        error.status === 404 ? "Preview expired." : "Preview service unavailable.",
        error.status === 404 ? 404 : 502,
      );
    }
    console.error("[ZoeBuild preview content proxy] failed", { buildProjectId, error });
    return errorResponse("Preview service unavailable.", 502);
  }
}


async function readCommerceJson(
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
  req: Request,
  ctx: {
    params: Promise<{
      buildProjectId: string;
      previewId: string;
      capability: string;
      path?: string[];
    }>;
  },
) {
  const {
    buildProjectId,
    previewId:
      rawPreviewId,
    capability,
  } = await ctx.params;

  try {
    const previewId =
      parseReactPreviewId(
        rawPreviewId,
      );

    if (
      !validCapability(
        capability,
      )
    ) {
      return errorResponse(
        "Invalid preview capability.",
        404,
      );
    }

    const url =
      new URL(
        req.url,
      );

    const basePath =
      `/api/build/projects/${encodeURIComponent(buildProjectId)}` +
      `/preview/${encodeURIComponent(previewId)}` +
      `/content/${encodeURIComponent(capability)}/`;

    const normalizedPathname =
      normalizeReactPreviewProxyPath({
        pathname:
          url.pathname,
        basePath,
      });

    if (
      !normalizedPathname
    ) {
      return errorResponse(
        "Invalid preview path.",
        404,
      );
    }

    const relativePath =
      normalizedPathname.slice(
        basePath.length,
      );

    const isCartPath =
      relativePath ===
        "__zoebuild/commerce/cart";

    const isCheckoutPath =
      relativePath ===
        "__zoebuild/commerce/checkout";

    if (
      !isCartPath &&
      !isCheckoutPath
    ) {
      return errorResponse(
        "Not found.",
        404,
      );
    }

    const context =
      await resolveTrustedReactPreviewCapabilityAtRunner({
        previewId,
        path:
          normalizedPathname,
      });

    if (
      context.buildProjectId !==
      buildProjectId
    ) {
      return errorResponse(
        "Preview capability does not match this project.",
        404,
      );
    }

    const cartRateLimit =
      await enforceNativeCommerceCartRateLimit(
        req,
        {
          buildProjectId:
            context.buildProjectId,
          scope:
            `preview:${previewId}`,
        },
      );

    if (
      !cartRateLimit.ok
    ) {
      if (
        cartRateLimit.kind ===
        "limited"
      ) {
        const response =
          errorResponse(
            "Too many cart requests.",
            429,
          );

        response.headers.set(
          "Retry-After",
          String(
            cartRateLimit.retryAfterSeconds ??
              60,
          ),
        );

        return response;
      }

      return errorResponse(
        "Commerce service unavailable.",
        503,
      );
    }

    if (
      isCheckoutPath
    ) {
      const checkout =
        await beginCommerceCheckout(
          prisma,
          {
            buildProjectId:
              context.buildProjectId,
            surface:
              "preview",
            request:
              parseCommerceCheckoutRequest(
                await readCommerceJson(
                  req,
                ),
              ),
          },
          trustedCommerceBuyerIpFromRequest(req),
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
            "Access-Control-Allow-Origin":
              "*",
            "Cross-Origin-Resource-Policy":
              "cross-origin",
            "Cache-Control":
              "no-store, max-age=0",
            "Content-Type":
              "application/json; charset=utf-8",
            "X-Content-Type-Options":
              "nosniff",
            "Referrer-Policy":
              "no-referrer",
          },
        },
      );
    }


    const command =
      parseNativeCommerceCartCommand(
        await readCommerceJson(
          req,
        ),
      );

    const cart =
      await executeCommerceCartCommand(
        prisma,
        {
          buildProjectId:
            context.buildProjectId,
          surface:
            "preview",
          command,
        },
        trustedCommerceBuyerIpFromRequest(req) ?? undefined,
      );

    return new Response(
      JSON.stringify({
        ok: true,
        cart,
      }),
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin":
            "*",
          "Cross-Origin-Resource-Policy":
            "cross-origin",
          "Cache-Control":
            "no-store, max-age=0",
          "Content-Type":
            "application/json; charset=utf-8",
          "X-Content-Type-Options":
            "nosniff",
          "Referrer-Policy":
            "no-referrer",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      NativeCommerceCheckoutError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      CommerceProviderResolutionError
    ) {
      return errorResponse(
        "Commerce service unavailable.",
        503,
      );
    }

    if (
      error instanceof
      NativeCommerceCartError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      ReactPreviewRequestError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      RunnerHttpError
    ) {
      return errorResponse(
        error.status === 404
          ? "Preview expired."
          : "Preview service unavailable.",
        error.status === 404
          ? 404
          : 502,
      );
    }

    console.error(
      "[ZoeBuild preview commerce cart] failed",
      {
        buildProjectId,
        error,
      },
    );

    return errorResponse(
      "Commerce service unavailable.",
      502,
    );
  }
}

export async function OPTIONS(
  _req: Request,
  ctx: {
    params: Promise<{
      buildProjectId: string;
      previewId: string;
      capability: string;
      path?: string[];
    }>;
  },
) {
  const {
    capability,
    path = [],
  } = await ctx.params;

  if (
    !validCapability(
      capability,
    ) ||
    ![
      "__zoebuild/commerce/cart",
      "__zoebuild/commerce/checkout",
    ].includes(
      path.join("/"),
    )
  ) {
    return errorResponse(
      "Not found.",
      404,
    );
  }

  return new Response(
    null,
    {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin":
          "*",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type",
        "Access-Control-Max-Age":
          "600",
        "Cross-Origin-Resource-Policy":
          "cross-origin",
        "Cache-Control":
          "no-store, max-age=0",
        "X-Content-Type-Options":
          "nosniff",
        "Referrer-Policy":
          "no-referrer",
      },
    },
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string; capability: string; path?: string[] }> },
) {
  return proxy(req, ctx, "GET");
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string; capability: string; path?: string[] }> },
) {
  return proxy(req, ctx, "HEAD");
}
