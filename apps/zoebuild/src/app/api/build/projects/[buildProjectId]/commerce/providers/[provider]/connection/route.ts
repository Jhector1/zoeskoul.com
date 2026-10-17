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
  CommerceProviderConnectionAdapterError,
  getCommerceProviderConnectionAdapter,
  supportsCommerceProviderConnectionEnvironment,
} from "@/lib/commerce/commerceProviderConnectionRegistry";

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

type RouteContext =
  Readonly<{
    params:
      Promise<{
        buildProjectId:
          string;
        provider:
          string;
      }>;
  }>;

async function mutateConnection(
  action:
    "connect" |
    "disconnect",
  request:
    Request,
  ctx:
    RouteContext,
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
    provider: rawProvider,
  } =
    await ctx.params;

  const provider =
    rawProvider
      .trim();

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

    const adapter =
      getCommerceProviderConnectionAdapter(
        provider,
      );

    if (!adapter) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PROVIDER_CONNECTION_ADAPTER_UNAVAILABLE",
          message:
            "This commerce provider does not have an executable connection adapter.",
        },
        409,
      );
    }

    const limited =
      await rateLimit(
        `zoebuild-commerce-provider-connection:${userId}:${buildProjectId}:${provider}`,
        {
          bucket:
            "zoebuild-commerce-provider-connection",
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
              "Too many commerce provider connection requests.",
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
      ) ??
      {};

    const environment =
      environmentValue(
        body.environment,
      );

    if (!environment) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PROVIDER_CONNECTION_ENVIRONMENT_INVALID",
          message:
            "A valid commerce provider environment is required.",
        },
        400,
      );
    }

    if (
      !supportsCommerceProviderConnectionEnvironment(
        provider,
        environment,
      )
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PROVIDER_CONNECTION_ENVIRONMENT_UNSUPPORTED",
          message:
            "This commerce provider connection adapter does not support the selected environment.",
        },
        409,
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

    const baseInput = {
      buildProjectId,
      storeId:
        store.id,
      environment,
      secretStore,
    } as const;

    const connection =
      action ===
        "connect"
        ? await adapter.connect(
            prisma,
            {
              ...baseInput,
              payload:
                body,
            },
          )
        : await adapter.disconnect(
            prisma,
            baseInput,
          );

    return json(
      requestId,
      {
        ok:
          true,
        connection,
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        CommerceProviderConnectionAdapterError
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
      "[ZoeBuild commerce provider connection] failed",
      {
        requestId,
        buildProjectId,
        provider,
        action,
        error,
      },
    );

    return json(
      requestId,
      {
        ok:
          false,
        code:
          "COMMERCE_PROVIDER_CONNECTION_FAILED",
        message:
          "Commerce provider connection could not be completed.",
      },
      500,
    );
  }
}

export async function POST(
  request:
    Request,
  ctx:
    RouteContext,
) {
  return mutateConnection(
    "connect",
    request,
    ctx,
  );
}

export async function DELETE(
  request:
    Request,
  ctx:
    RouteContext,
) {
  return mutateConnection(
    "disconnect",
    request,
    ctx,
  );
}
