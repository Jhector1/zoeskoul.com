import Stripe from "stripe";

import {
  NextResponse,
} from "next/server";

import {
  BuildAccessError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  BuildSecretStoreError,
  createBuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";

import {
  createPrismaBuildProjectReader,
} from "@/lib/build/readBuildProjects";

import {
  configureStripeCommerceWebhookSecret,
  readStripeCommerceWebhookSecrets,
  reconcileStripeCommerceWebhookEvent,
  StripeCommerceWebhookError,
} from "@/lib/commerce/stripeCommerceWebhook";

import type {
  CommerceProviderEnvironment,
} from "@/lib/commerce/nativeCommerceProvider";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAX_WEBHOOK_BYTES =
  1024 * 1024;

const MAX_CONFIG_BYTES =
  16 * 1024;

function json(
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
      body,
      {
        status,
      },
    );

  response.headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );

  return response;
}

function environmentValue(
  value:
    string,
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

function sameOrigin(
  request:
    Request,
) {
  const rawOrigin =
    request.headers
      .get(
        "origin",
      )
      ?.trim();

  if (!rawOrigin) {
    return false;
  }

  try {
    return new URL(
      rawOrigin,
    ).origin ===
      new URL(
        request.url,
      ).origin;
  } catch {
    return false;
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

  if (!access.userId) {
    throw new StripeCommerceWebhookError(
      "BUILD_AUTH_REQUIRED",
      "Authentication required.",
      401,
    );
  }

  await getBuildProjectCommand({
    access,
    buildProjectId,
    reader:
      createPrismaBuildProjectReader(
        prisma,
      ),
  });
}

async function storeAndConnection(
  buildProjectId:
    string,
  environment:
    CommerceProviderEnvironment,
) {
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
    throw new StripeCommerceWebhookError(
      "COMMERCE_STORE_NOT_FOUND",
      "Commerce store not found.",
      404,
    );
  }

  const connection =
    await prisma
      .commerceProviderConnection
      .findUnique({
        where: {
          storeId_provider_environment: {
            storeId:
              store.id,
            provider:
              "stripe",
            environment,
          },
        },
        select: {
          id:
            true,
          environment:
            true,
          status:
            true,
          credentialsSecretRef:
            true,
          webhookSecretRef:
            true,
        },
      });

  if (
    !connection ||
    connection.status !==
      "active"
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_CONNECTION_REQUIRED",
      "Stripe connection is not active for this environment.",
      503,
    );
  }

  return {
    store,
    connection,
  };
}

async function routeParams(
  context: {
    params:
      Promise<{
        buildProjectId:
          string;
        environment:
          string;
      }>;
  },
) {
  const params =
    await context.params;

  const buildProjectId =
    params
      .buildProjectId
      .trim();

  const environment =
    environmentValue(
      params
        .environment
        .trim(),
    );

  if (
    !buildProjectId ||
    !environment
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_ROUTE_INVALID",
      "Stripe webhook route is invalid.",
      404,
    );
  }

  return {
    buildProjectId,
    environment,
  };
}

function webhookErrorResponse(
  error:
    unknown,
) {
  if (
    error instanceof
    StripeCommerceWebhookError
  ) {
    return json(
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
      {
        ok:
          false,
        code:
          "BUILD_SECRET_STORE_UNAVAILABLE",
        message:
          "Secure webhook configuration is unavailable.",
      },
      503,
    );
  }

  if (
    error instanceof
    BuildAccessError
  ) {
    return json(
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
    "[ZoeBuild Stripe webhook] failed",
    {
      error:
        error instanceof
          Error
          ? {
              name:
                error.name,
              message:
                error.message,
            }
          : "unknown",
    },
  );

  return json(
    {
      ok:
        false,
      code:
        "STRIPE_WEBHOOK_FAILED",
      message:
        "Stripe webhook processing failed.",
    },
    500,
  );
}

export async function PUT(
  request:
    Request,
  context: {
    params:
      Promise<{
        buildProjectId:
          string;
        environment:
          string;
      }>;
  },
) {
  try {
    if (
      !sameOrigin(
        request,
      )
    ) {
      return json(
        {
          ok:
            false,
          code:
            "BUILD_ORIGIN_INVALID",
          message:
            "Request origin is invalid.",
        },
        403,
      );
    }

    const {
      buildProjectId,
      environment,
    } =
      await routeParams(
        context,
      );

    await authorizeProject(
      request,
      buildProjectId,
    );

    const raw =
      await request.text();

    if (
      Buffer.byteLength(
        raw,
        "utf8",
      ) >
      MAX_CONFIG_BYTES
    ) {
      return json(
        {
          ok:
            false,
          code:
            "STRIPE_WEBHOOK_CONFIG_TOO_LARGE",
          message:
            "Stripe webhook configuration is too large.",
        },
        413,
      );
    }

    let body:
      unknown;

    try {
      body =
        JSON.parse(
          raw,
        );
    } catch {
      return json(
        {
          ok:
            false,
          code:
            "STRIPE_WEBHOOK_CONFIG_INVALID",
          message:
            "Stripe webhook configuration is invalid.",
        },
        400,
      );
    }

    const webhookSecret =
      (
        body &&
        typeof body ===
          "object" &&
        !Array.isArray(
          body,
        ) &&
        typeof (
          body as
            Record<
              string,
              unknown
            >
        ).webhookSecret ===
          "string"
      )
        ? (
            body as
              Record<
                string,
                string
              >
          ).webhookSecret
        : "";

    const {
      store,
    } =
      await storeAndConnection(
        buildProjectId,
        environment,
      );

    const secretStore =
      createBuildSecretStore({
        prisma,
      });

    const configured =
      await configureStripeCommerceWebhookSecret(
        prisma,
        {
          buildProjectId,
          storeId:
            store.id,
          environment,
          webhookSecret,
          secretStore,
        },
      );

    return json({
      ok:
        true,
      webhook:
        configured,
      endpointPath:
        `/api/build/projects/${encodeURIComponent(buildProjectId)}/commerce/providers/stripe/webhook/${environment}`,
    });
  } catch (
    error
  ) {
    return webhookErrorResponse(
      error,
    );
  }
}

export async function POST(
  request:
    Request,
  context: {
    params:
      Promise<{
        buildProjectId:
          string;
        environment:
          string;
      }>;
  },
) {
  try {
    const {
      buildProjectId,
      environment,
    } =
      await routeParams(
        context,
      );

    const signature =
      request.headers
        .get(
          "stripe-signature",
        )
        ?.trim();

    if (!signature) {
      return json(
        {
          received:
            false,
          code:
            "STRIPE_SIGNATURE_REQUIRED",
        },
        400,
      );
    }

    const rawBody =
      await request.text();

    if (
      Buffer.byteLength(
        rawBody,
        "utf8",
      ) >
      MAX_WEBHOOK_BYTES
    ) {
      return json(
        {
          received:
            false,
          code:
            "STRIPE_WEBHOOK_TOO_LARGE",
        },
        413,
      );
    }

    const {
      connection,
    } =
      await storeAndConnection(
        buildProjectId,
        environment,
      );

    const secretStore =
      createBuildSecretStore({
        prisma,
      });

    const {
      apiKey,
      webhookSecret,
    } =
      await readStripeCommerceWebhookSecrets({
        buildProjectId,
        environment,
        connection,
        secretStore,
      });

    const stripe =
      new Stripe(
        apiKey,
        {
          maxNetworkRetries:
            0,
          timeout:
            10_000,
        },
      );

    let event:
      Stripe.Event;

    try {
      event =
        stripe
          .webhooks
          .constructEvent(
            rawBody,
            signature,
            webhookSecret,
          );
    } catch {
      return json(
        {
          received:
            false,
          code:
            "STRIPE_SIGNATURE_INVALID",
        },
        400,
      );
    }

    const result =
      await reconcileStripeCommerceWebhookEvent(
        prisma,
        {
          buildProjectId,
          environment,
          event,
        },
      );

    return json({
      received:
        true,
      status:
        result.status,
      orderId:
        result.orderId,
    });
  } catch (
    error
  ) {
    return webhookErrorResponse(
      error,
    );
  }
}
