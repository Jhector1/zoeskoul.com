import {
  NextResponse,
} from "next/server";

import {
  BuildAccessError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import {
  enforceSameOriginPost,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  BuildSecretStoreError,
  createBuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

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
  connectStripeCommerceEnvironment,
  StripeCommerceConnectionError,
} from "@/lib/commerce/stripeCommerceConnection";

import type {
  CommerceProviderEnvironment,
} from "@/lib/commerce/nativeCommerceProvider";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

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
    value &&
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

function environmentValue(
  value:
    unknown,
):
  CommerceProviderEnvironment |
  null {
  return value ===
    "test" ||
    value ===
      "live"
    ? value
    : null;
}

async function authorizeProject(
  buildProjectId:
    string,
  request:
    Request,
) {
  const access =
    await loadCurrentBuildAccessSnapshot(
      request,
    );

  if (!access.userId) {
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

  const {
    buildProjectId,
  } =
    await ctx.params;

  try {
    const authorization =
      await authorizeProject(
        buildProjectId,
        request,
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
        "not-found"
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

    const limited =
      await rateLimit(
        `zoebuild-stripe-connection:${userId}:${buildProjectId}`,
        {
          bucket:
            "zoebuild-stripe-connection",
          limit:
            20,
          window:
            "1 h",
        },
      ).catch(
        () =>
          null,
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

    if (!limited.ok) {
      const response =
        json(
          requestId,
          {
            ok:
              false,
            code:
              "BUILD_RATE_LIMITED",
            message:
              "Too many Stripe connection requests.",
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
              1000,
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

    const environment =
      environmentValue(
        body?.environment,
      );

    const apiKey =
      typeof body?.apiKey ===
        "string"
        ? body.apiKey
        : "";

    if (
      !environment ||
      !apiKey
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "STRIPE_CONNECTION_INPUT_INVALID",
          message:
            "Stripe environment and API key are required.",
        },
        400,
      );
    }

    const store =
      await prisma
        .commerceStore
        .findUnique({
          where: {
            buildProjectId,
          },
          select: {
            id:
              true,
          },
        });

    if (!store) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_STORE_NOT_FOUND",
          message:
            "Commerce store not found.",
        },
        404,
      );
    }

    const secretStore =
      createBuildSecretStore({
        prisma,
      });

    const connected =
      await connectStripeCommerceEnvironment(
        prisma,
        {
          buildProjectId,
          storeId:
            store.id,
          environment,
          apiKey,
          secretStore,
        },
      );

    return json(
      requestId,
      {
        ok:
          true,
        connection:
          connected,
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        StripeCommerceConnectionError
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
        BuildSecretStoreError
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "BUILD_SECRET_STORE_UNAVAILABLE",
          message:
            "Secure credential storage is unavailable.",
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
      "[ZoeBuild Stripe connection] failed",
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
          "STRIPE_CONNECTION_FAILED",
        message:
          "Stripe connection could not be completed.",
      },
      500,
    );
  }
}
