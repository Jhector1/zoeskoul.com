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
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";
import { shopifyOAuthRoutesConfigured } from "@/lib/commerce/shopifyOAuthRouteFlow";
import {
  createPrismaBuildProjectReader,
} from "@/lib/build/readBuildProjects";
import {
  COMMERCE_PROVIDER_DEFINITIONS,
  DEFAULT_COMMERCE_PAYMENT_PROVIDER,
  DEFAULT_COMMERCE_STORE_PROVIDER,
  getCommerceProviderDefinition,
} from "@/lib/commerce/commerceProviderCatalog";
import {
  supportsCommerceProviderExecutionForEnvironments,
} from "@/lib/commerce/commerceRuntimeRegistry";
import {
  COMMERCE_PROVIDER_CAPABILITIES,
  COMMERCE_PROVIDER_ENVIRONMENTS,
  type CommerceProviderCapability,
  type CommerceProviderEnvironment,
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

const CAPABILITY_SET =
  new Set<string>(
    COMMERCE_PROVIDER_CAPABILITIES,
  );

function parseCapabilities(
  value:
    unknown,
):
  readonly CommerceProviderCapability[] |
  null {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length === 0
  ) {
    return null;
  }

  const unique =
    new Set<
      CommerceProviderCapability
    >();

  for (
    const item of value
  ) {
    if (
      typeof item !==
        "string" ||
      !CAPABILITY_SET.has(
        item,
      )
    ) {
      return null;
    }

    unique.add(
      item as
        CommerceProviderCapability,
    );
  }

  return [
    ...unique,
  ];
}

function parseEnvironment(
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
  request?:
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

async function readStoreSnapshot(
  buildProjectId:
    string,
) {
  return prisma
    .commerceStore
    .findUnique({
      where: {
        buildProjectId,
      },
      select: {
        id:
          true,
        status:
          true,
        defaultCurrency:
          true,
        providerRoutes: {
          orderBy: [
            {
              environment:
                "asc",
            },
            {
              capability:
                "asc",
            },
          ],
          select: {
            environment:
              true,
            capability:
              true,
            provider:
              true,
            connectionId:
              true,
            connection: {
              select: {
                status:
                  true,
              },
            },
          },
        },
        providerConnections: {
          orderBy: [
            {
              provider:
                "asc",
            },
            {
              environment:
                "asc",
            },
          ],
          select: {
            provider:
              true,
            environment:
              true,
            status:
              true,
            webhookSecretRef:
              true,
            storefrontSecretRef: true,
          },
        },
      },
    });
}

function publicProviderDirectory() {
  return COMMERCE_PROVIDER_DEFINITIONS.map(
    (definition) => ({
      id:
        definition.id,
      displayName:
        definition.displayName,
      description:
        definition.description,
      connectionRequired:
        definition.connectionRequired,
      recommendedStore:
        definition.recommendedStore,
      recommendedPayment:
        definition.recommendedPayment,
      capabilities:
        definition.capabilities,
      executableCapabilities:
        Object.fromEntries(
          COMMERCE_PROVIDER_CAPABILITIES.map(
            (capability) => [
              capability,
              supportsCommerceProviderExecutionForEnvironments(
            definition.id,
            capability,
            definition.environments,
          ),
            ],
          ),
        ),
    }),
  );
}

function publicStoreSnapshot(
  store:
    NonNullable<
      Awaited<
        ReturnType<
          typeof readStoreSnapshot
        >
      >
    >,
) {
  return {
    id:
      store.id,
    status:
      store.status,
    defaultCurrency:
      store.defaultCurrency,
    routes:
      store.providerRoutes.map(
        (route) => ({
          environment:
            route.environment,
          capability:
            route.capability,
          provider:
            route.provider,
          connected:
            route.connection?.status ===
              "active",
        }),
      ),
    connections:
      store.providerConnections.map(
        (connection) => ({
          provider:
            connection.provider,
          environment:
            connection.environment,
          status:
            connection.status,
          // This is a derived readiness boolean, never a secret or vault ref.
          storefrontConfigured:
            connection.provider === "shopify" && connection.status === "active" &&
            Boolean(connection.storefrontSecretRef),
          webhookConfigured:
            connection.provider ===
              "stripe" &&
            connection.status ===
              "active" &&
            Boolean(connection.webhookSecretRef),
        }),
      ),
  };
}

export async function GET(
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

  const {
    buildProjectId,
  } = await ctx.params;

  try {
    const authorization =
      await authorizeProject(
        buildProjectId,
        request,
      );

    if (
      authorization.error ===
      "auth"
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

    const store =
      await readStoreSnapshot(
        buildProjectId,
      );

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

    return json(
      requestId,
      {
        ok:
          true,
        defaultStoreProvider:
          DEFAULT_COMMERCE_STORE_PROVIDER,
        defaultPaymentProvider:
          DEFAULT_COMMERCE_PAYMENT_PROVIDER,
        providers:
          publicProviderDirectory(),
        shopifyOAuthConfigured: shopifyOAuthRoutesConfigured({
          enabled: process.env.ZOEBUILD_SHOPIFY_OAUTH_ROUTES_ENABLED,
          clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID,
          clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET,
        }),
        store:
          publicStoreSnapshot(
            store,
          ),
      },
    );
  } catch (
    error
  ) {
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
      "[ZoeBuild commerce providers] read failed",
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
          "COMMERCE_PROVIDER_READ_FAILED",
        message:
          "Commerce configuration could not be loaded.",
      },
      500,
    );
  }
}

export async function PATCH(
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
  } = await ctx.params;

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
        `zoebuild-commerce-provider:${userId}:${buildProjectId}`,
        {
          bucket:
            "zoebuild-commerce-provider",
          limit:
            60,
          window:
            "1 h",
        },
      ).catch(
        (error) => {
          console.error(
            "[ZoeBuild commerce providers] rate limit unavailable",
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
              "Too many commerce configuration requests.",
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

    const provider =
      typeof body?.provider ===
        "string"
        ? body.provider.trim()
        : "";

    const capabilities =
      parseCapabilities(
        body?.capabilities,
      );

    const environmentInput =
      body?.environment;

    const environment =
      environmentInput ===
        undefined
        ? null
        : parseEnvironment(
            environmentInput,
          );

    if (
      environmentInput !==
        undefined &&
      !environment
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PROVIDER_ENVIRONMENT_INVALID",
          message:
            "Invalid commerce provider environment.",
        },
        400,
      );
    }

    const targetEnvironments:
      readonly CommerceProviderEnvironment[] =
        environment
          ? [
              environment,
            ]
          : [
              ...COMMERCE_PROVIDER_ENVIRONMENTS,
            ];

    const definition =
      getCommerceProviderDefinition(
        provider,
      );

    if (
      !definition ||
      !capabilities
    ) {
      return json(
        requestId,
        {
          ok:
            false,
          code:
            "COMMERCE_PROVIDER_SELECTION_INVALID",
          message:
            "Invalid commerce provider selection.",
        },
        400,
      );
    }

    for (
      const capability of
      capabilities
    ) {
      if (
        !definition
          .capabilities[
            capability
          ]
      ) {
        return json(
          requestId,
          {
            ok:
              false,
            code:
              "COMMERCE_PROVIDER_CAPABILITY_UNSUPPORTED",
            message:
              `${definition.displayName} does not support ${capability}.`,
          },
          400,
        );
      }
    }

    for (
      const capability of
      capabilities
    ) {
      if (
        !supportsCommerceProviderExecutionForEnvironments(
            definition.id,
            capability,
            targetEnvironments,
          )
      ) {
        return json(
          requestId,
          {
            ok:
              false,
            code:
              "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
            message:
              `${definition.displayName} is not executable for ${capability} on this ZoeBuild runtime.`,
          },
          409,
        );
      }
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

    const connectionByEnvironment =
      new Map<
        string,
        string
      >();

    const connections =
      await prisma
        .commerceProviderConnection
        .findMany({
          where: {
            storeId:
              store.id,
            provider:
              definition.id,
            status:
              "active",
            environment: {
              in: [
                ...targetEnvironments,
              ],
            },
          },
          select: {
            id:
              true,
            environment:
              true,
            webhookSecretRef:
              true,
          },
        });

    for (
      const connection of
      connections
    ) {
      connectionByEnvironment.set(
        connection.environment,
        connection.id,
      );
    }

    for (
      const environment of
      targetEnvironments
    ) {
      if (
        !connectionByEnvironment.has(
          environment,
        )
      ) {
        return json(
          requestId,
          {
            ok:
              false,
            code:
              "COMMERCE_PROVIDER_CONNECTION_REQUIRED",
            message:
              definition.connectionRequired
                ? `${definition.displayName} needs an active ${environment} connection before it can own commerce capabilities in that environment.`
                : `${definition.displayName} internal ${environment} connection is unavailable.`,
          },
          409,
        );
      }
    }

    const stripePaymentRouting =
      definition.id === "stripe" &&
      capabilities.includes("payments");

    if (stripePaymentRouting) {
      for (const targetEnvironment of targetEnvironments) {
        const ready = connections.some(
          (connection) =>
            connection.environment === targetEnvironment &&
            Boolean(connection.webhookSecretRef),
        );

        if (!ready) {
          return json(
            requestId,
            {
              ok: false,
              code: "STRIPE_WEBHOOK_CONFIGURATION_REQUIRED",
              message: `Configure the Stripe ${targetEnvironment} webhook signing secret before activating payments.`,
            },
            409,
          );
        }
      }
    }

    await prisma
      .$transaction(
        async (
          tx,
        ) => {
          for (
            const environment of
            targetEnvironments
          ) {
            const connectionId =
              connectionByEnvironment.get(
                environment,
              );

            if (!connectionId) {
              throw new Error(
                `Missing explicit ${environment} provider connection for ${definition.id}.`,
              );
            }

            for (
              const capability of
              capabilities
            ) {
              await tx
                .commerceProviderRoute
                .upsert({
                  where: {
                    storeId_environment_capability: {
                      storeId:
                        store.id,
                      environment,
                      capability,
                    },
                  },
                  create: {
                    storeId:
                      store.id,
                    environment,
                    capability,
                    provider:
                      definition.id,
                    connectionId,
                  },
                  update: {
                    provider:
                      definition.id,
                    connectionId,
                  },
                });
            }
          }
        },
      );

    const updated =
      await readStoreSnapshot(
        buildProjectId,
      );

    if (!updated) {
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

    return json(
      requestId,
      {
        ok:
          true,
        provider:
          definition.id,
        capabilities,
        environments:
          targetEnvironments,
        store:
          publicStoreSnapshot(
            updated,
          ),
      },
    );
  } catch (
    error
  ) {
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
      "[ZoeBuild commerce providers] update failed",
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
          "COMMERCE_PROVIDER_UPDATE_FAILED",
        message:
          "Commerce configuration could not be updated.",
      },
      500,
    );
  }
}
