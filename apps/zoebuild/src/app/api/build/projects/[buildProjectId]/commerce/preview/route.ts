import {
  NextResponse,
} from "next/server";

import {
  BuildAccessError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";

import {
  createPrismaBuildProjectReader,
} from "@/lib/build/readBuildProjects";

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
  CommerceProviderResolutionError,
} from "@/lib/commerce/commerceProviderResolver";
import {
  beginCommerceCheckout,
  executeCommerceCartCommand,
  getCommerceProduct,
  listCommerceProducts,
} from "@/lib/commerce/commerceRuntime";
import { trustedCommerceBuyerIpFromRequest, type VerifiedCommerceBuyerIp } from "@/lib/commerce/trustedCommerceBuyerIp";
import { hasReactCommerceCapability } from "@/lib/build/reactCommerceCapability";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAX_BODY_BYTES =
  16_384;

type PreviewCommerceMethod =
  | "products.list"
  | "products.get"
  | "cart.get"
  | "cart.add"
  | "cart.update"
  | "cart.remove"
  | "checkout.begin";

function json(
  requestId:
    string,
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
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

function record(
  value:
    unknown,
): Record<
  string,
  unknown
> | null {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<
          string,
          unknown
        >
    : null;
}

function methodValue(
  value:
    unknown,
): PreviewCommerceMethod |
  null {
  switch (
    value
  ) {
    case "products.list":
    case "products.get":
    case "cart.get":
    case "cart.add":
    case "cart.update":
    case "cart.remove":
    case "checkout.begin":
      return value;

    default:
      return null;
  }
}

async function authorizeProject(
  request:
    Request,
  buildProjectId:
    string,
) {
  const access =
    await loadCurrentBuildAccessSnapshot(
      request,
    );

  if (
    !access.userId
  ) {
    return {
      access,
      project:
        null,
      error:
        "auth" as const,
    };
  }

  const project =
    await getBuildProjectCommand({
      access,
      buildProjectId,
      reader:
        createPrismaBuildProjectReader(
          prisma,
        ),
    });

  return {
    access,
    project,
    error:
      project
        ? null
        : "not-found" as const,
  };
}

function firstValue(
  value:
    unknown,
) {
  if (
    value == null
  ) {
    return null;
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    )
  ) {
    return String(
      value,
    );
  }

  return "__invalid__";
}

async function executePreviewCommerce(
  buildProjectId:
    string,
  method:
    PreviewCommerceMethod,
  input:
    Record<
      string,
      unknown
    >,
  verifiedBuyerIp: VerifiedCommerceBuyerIp | null,
) {
  if (
    method ===
    "products.list"
  ) {

    return listCommerceProducts(
      prisma,
      {
        buildProjectId,
        surface:
          "preview",
        first:
          firstValue(
            input.first,
          ),
      },
    );
  }

  if (
    method ===
    "products.get"
  ) {

    return getCommerceProduct(
      prisma,
      {
        buildProjectId,
        surface:
          "preview",
        id:
          typeof input.id ===
          "string"
            ? input.id
            : null,
        slug:
          typeof input.slug ===
          "string"
            ? input.slug
            : null,
      },
    );
  }

  if (
    method ===
    "checkout.begin"
  ) {
    return beginCommerceCheckout(
      prisma,
      {
        buildProjectId,
        surface:
          "preview",
        request:
          parseCommerceCheckoutRequest(
            input,
          ),
      },
      verifiedBuyerIp,
    );
  }


  const operation =
    method.slice(
      "cart.".length,
    );

  const command =
    parseNativeCommerceCartCommand({
      ...input,
      operation,
    });

  return executeCommerceCartCommand(
    prisma,
    {
      buildProjectId,
      surface:
        "preview",
      command,
    },
    verifiedBuyerIp ?? undefined,
  );
}

export async function POST(
  request:
    Request,
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
      request,
    )
  ) {
    return json(
      requestId,
      {
        ok:
          false,
        code:
          "BUILD_FORBIDDEN",
        message:
          "Forbidden.",
      },
      403,
    );
  }

  if (
    exceedsContentLength(
      request,
      MAX_BODY_BYTES,
    )
  ) {
    return json(
      requestId,
      {
        ok:
          false,
        code:
          "COMMERCE_REQUEST_TOO_LARGE",
        message:
          "Commerce preview request is too large.",
      },
      413,
    );
  }

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
    return json(
      requestId,
      {
        ok:
          false,
        code:
          "COMMERCE_CONTENT_TYPE_INVALID",
        message:
          "Commerce preview requests require application/json.",
      },
      415,
    );
  }

  const {
    buildProjectId,
  } =
    await ctx.params;

  try {
    const authorization =
      await authorizeProject(
        request,
        buildProjectId,
      );

    const userId =
      authorization
        .access
        .userId ??
      "";

    if (
      authorization.error ===
        "auth" ||
      !userId
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "BUILD_AUTH_REQUIRED",
          message:
            "Unauthorized.",
        },
        401,
      );
    }

    if (
      authorization.error ===
        "not-found" ||
      !authorization.project
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "BUILD_PROJECT_NOT_FOUND",
          message:
            "Project not found.",
        },
        404,
      );
    }

    if (!hasReactCommerceCapability(authorization.project)) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PREVIEW_UNAVAILABLE",
          message:
            "Commerce preview is unavailable for this project.",
        },
        404,
      );
    }

    const limited =
      await rateLimit(
        `zoebuild-commerce-preview:${userId}:${buildProjectId}`,
        {
          bucket:
            "zoebuild-commerce-preview",
          limit:
            1_200,
          window:
            "1 h",
        },
      ).catch(
        (
          error,
        ) => {
          console.error(
            "[ZoeBuild commerce preview] rate limit unavailable",
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
          ok:
            false,
          code:
            "BUILD_SERVICE_UNAVAILABLE",
          message:
            "Service unavailable.",
        },
        503,
      );
    }

    if (
      !limited.ok
    ) {
      const response =
        json(
          requestId,
          {
            ok:
              false,
            code:
              "BUILD_RATE_LIMITED",
            message:
              "Too many commerce preview requests.",
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
              ) /
                1_000,
            ),
          ),
        ),
      );

      return response;
    }

    const body =
      record(
        await readJsonSafe(
          request,
        ),
      );

    const method =
      methodValue(
        body?.method,
      );

    const input =
      record(
        body?.input,
      );

    if (
      !body ||
      !method ||
      !input
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PREVIEW_REQUEST_INVALID",
          message:
            "Invalid commerce preview request.",
        },
        400,
      );
    }

    const result =
      await executePreviewCommerce(
        buildProjectId,
        method,
        input,
        trustedCommerceBuyerIpFromRequest(request),
      );

    return json(
      requestId,
      {
        ok:
          true,
        result,
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      NativeCommerceCatalogInputError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_CATALOG_REQUEST_INVALID",
          message:
            error.message,
        },
        400,
      );
    }

    if (
      error instanceof
      NativeCommerceCartError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            error.code,
          message:
            error.message,
        },
        error.status,
      );
    }

    if (
      error instanceof
      NativeCommerceCheckoutError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            error.code,
          message:
            error.message,
        },
        error.status,
      );
    }

    if (
      error instanceof
      CommerceProviderResolutionError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PREVIEW_UNAVAILABLE",
          message:
            "Commerce service unavailable.",
        },
        503,
      );
    }

    if (
      error instanceof
      BuildAccessError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
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

    console.error(
      "[ZoeBuild commerce preview] failed",
      {
        requestId,
        buildProjectId,
        error,
      },
    );

    return json(
      requestId,
      {
        ok:
          false,
        code:
          "COMMERCE_PREVIEW_FAILED",
        message:
          "Commerce preview request failed.",
      },
      502,
    );
  }
}
