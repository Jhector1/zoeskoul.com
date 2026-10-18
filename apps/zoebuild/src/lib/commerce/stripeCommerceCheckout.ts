import "server-only";

import Stripe from "stripe";

import type {
  CommercePaymentsCapabilityHandler,
} from "@zoeskoul/provider-contracts";
import type {
  BuildSecretJsonValue,
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  TrustedCommerceOrderSnapshot,
} from "./commerceRuntimeContracts";

import type {
  CommerceProviderConnectionSnapshot,
} from "./commerceProviderConnectionContract";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export const STRIPE_COMMERCE_PROVIDER =
  "stripe" as const;

export const ZOEBUILD_PUBLIC_ORIGIN_ENV =
  "ZOEBUILD_PUBLIC_ORIGIN" as const;

const STRIPE_REQUEST_TIMEOUT_MS =
  10_000;

const STRIPE_MAX_NETWORK_RETRIES =
  2;

type StripeCheckoutSession =
  Readonly<{
    id: string;
    url: string | null;
  }>;

type StripeCheckoutClient =
  Readonly<{
    checkout:
      Readonly<{
        sessions:
          Readonly<{
            create(
              params:
                Stripe.Checkout.SessionCreateParams,
              options?:
                Stripe.RequestOptions,
            ):
              Promise<
                StripeCheckoutSession
              >;
          }>;
      }>;
  }>;

type StripeClientFactory =
  (
    secretKey:
      string,
  ) =>
    StripeCheckoutClient;

export class StripeCommerceCheckoutError
  extends Error {
  readonly code:
    string;

  constructor(
    code: string,
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "StripeCommerceCheckoutError";

    this.code =
      code;
  }
}

function isRecord(
  value:
    unknown,
): value is
  Readonly<
    Record<
      string,
      unknown
    >
  > {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

function stripeCredentialsRef(
  connection:
    CommerceProviderConnectionSnapshot,
) {
  const ref =
    connection
      .credentialsSecretRef
      ?.trim();

  if (!ref) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_CREDENTIALS_REQUIRED",
      "Stripe credentials are not configured.",
    );
  }

  return ref;
}

function stripeSecretKey(
  value:
    BuildSecretJsonValue,
  environment:
    CommerceProviderEnvironment,
) {
  if (
    !isRecord(
      value,
    )
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_CREDENTIALS_INVALID",
      "Stripe credentials are invalid.",
    );
  }

  const raw =
    value.secretKey;

  if (
    typeof raw !==
      "string"
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_CREDENTIALS_INVALID",
      "Stripe credentials are invalid.",
    );
  }

  const key =
    raw.trim();

  const expected =
    environment ===
      "test"
      ? /^(sk|rk)_test_/
      : /^(sk|rk)_live_/;

  if (
    !expected.test(
      key,
    )
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_ENVIRONMENT_MISMATCH",
      "Stripe credential environment does not match the commerce route.",
    );
  }

  return key;
}

function defaultPublicOrigin(
  environment:
    Readonly<
      Record<
        string,
        string | undefined
      >
    > =
      process.env,
) {
  const raw =
    environment[
      ZOEBUILD_PUBLIC_ORIGIN_ENV
    ]?.trim();

  if (!raw) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_RETURN_ORIGIN_REQUIRED",
      `${ZOEBUILD_PUBLIC_ORIGIN_ENV} is required for Stripe Checkout.`,
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(
        raw,
      );
  } catch {
    throw new StripeCommerceCheckoutError(
      "STRIPE_RETURN_ORIGIN_INVALID",
      `${ZOEBUILD_PUBLIC_ORIGIN_ENV} must be an absolute URL.`,
    );
  }

  const localHttp =
    url.protocol ===
      "http:" &&
    (
      url.hostname ===
        "localhost" ||
      url.hostname ===
        "127.0.0.1"
    );

  if (
    url.protocol !==
      "https:" &&
    !localHttp
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_RETURN_ORIGIN_INVALID",
      `${ZOEBUILD_PUBLIC_ORIGIN_ENV} must use HTTPS except for localhost development.`,
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_RETURN_ORIGIN_INVALID",
      `${ZOEBUILD_PUBLIC_ORIGIN_ENV} must be an origin without credentials, query, or fragment.`,
    );
  }

  return url.origin;
}

function returnUrls(
  input:
    Readonly<{
      origin: string;
      buildProjectId: string;
      environment:
        CommerceProviderEnvironment;
      orderId: string;
    }>,
) {
  const path =
    input.environment ===
      "test"
      ? `/projects/${encodeURIComponent(
          input.buildProjectId,
        )}`
      : `/sites/${encodeURIComponent(
          input.buildProjectId,
        )}`;

  const success =
    new URL(
      path,
      input.origin,
    );

  success.searchParams.set(
    "checkout",
    "success",
  );

  success.searchParams.set(
    "orderId",
    input.orderId,
  );

  const cancel =
    new URL(
      path,
      input.origin,
    );

  cancel.searchParams.set(
    "checkout",
    "cancel",
  );

  cancel.searchParams.set(
    "orderId",
    input.orderId,
  );

  return {
    successUrl:
      success.toString(),
    cancelUrl:
      cancel.toString(),
  };
}

function stripeLineName(
  item:
    TrustedCommerceOrderSnapshot[
      "items"
    ][number],
) {
  const variant =
    item.variantTitle
      .trim();

  return variant
    ? `${item.title} — ${variant}`
    : item.title;
}

function assertTrustedStripeTotal(
  order:
    TrustedCommerceOrderSnapshot,
) {
  if (
    order.discountMinor !==
      0 ||
    order.taxMinor !==
      0 ||
    order.shippingMinor !==
      0
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_ORDER_ADJUSTMENTS_UNSUPPORTED",
      "Stripe Checkout cannot start until order adjustments are mapped explicitly.",
    );
  }

  const subtotal =
    order.items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.lineTotalMinor,
      0,
    );

  if (
    subtotal !==
      order.subtotalMinor ||
    order.totalMinor !==
      order.subtotalMinor
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_ORDER_TOTAL_MISMATCH",
      "Trusted order totals do not reconcile for Stripe Checkout.",
    );
  }
}

function stripeCheckoutExpiresAt(
  order:
    TrustedCommerceOrderSnapshot,
  environment:
    CommerceProviderEnvironment,
) {
  if (
    order.paymentEnvironment !==
    environment
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_ORDER_ENVIRONMENT_MISMATCH",
      "Trusted order environment does not match the Stripe route.",
    );
  }

  const milliseconds =
    order.checkoutExpiresAt
      .getTime();

  if (
    !Number.isFinite(
      milliseconds,
    ) ||
    milliseconds <=
      Date.now()
  ) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_CHECKOUT_EXPIRED",
      "Trusted checkout reservation has expired.",
    );
  }

  return Math.floor(
    milliseconds /
      1000,
  );
}

export async function readStripeSecretKey(
  input:
    Readonly<{
      buildProjectId: string;
      environment:
        CommerceProviderEnvironment;
      connection:
        CommerceProviderConnectionSnapshot;
      secretStore:
        BuildSecretStore;
    }>,
) {
  const credentials =
    await input.secretStore
      .read({
        buildProjectId:
          input.buildProjectId,
        secretRef:
          stripeCredentialsRef(
            input.connection,
          ),
      });

  return stripeSecretKey(
    credentials,
    input.environment,
  );
}

function defaultStripeClient(
  secretKey:
    string,
): StripeCheckoutClient {
  return new Stripe(
    secretKey,
    {
      maxNetworkRetries:
        STRIPE_MAX_NETWORK_RETRIES,
      timeout:
        STRIPE_REQUEST_TIMEOUT_MS,
    },
  );
}

export type PreparedStripeCommercePayments =
  Readonly<{
    provider:
      typeof STRIPE_COMMERCE_PROVIDER;

    forOrder(
      order:
        TrustedCommerceOrderSnapshot,
    ):
      CommercePaymentsCapabilityHandler;
  }>;

export async function prepareStripeCommercePayments(
  input:
    Readonly<{
      buildProjectId: string;
      environment:
        CommerceProviderEnvironment;
      connection:
        CommerceProviderConnectionSnapshot;
      secretStore?:
        BuildSecretStore;
    }>,
  dependencies:
    Readonly<{
      createClient?:
        StripeClientFactory;
      resolvePublicOrigin?:
        () => string;
    }> =
      {},
): Promise<
  PreparedStripeCommercePayments
> {
  if (!input.secretStore) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_SERVER_CONTEXT_REQUIRED",
      "Stripe payment execution requires secure server credentials.",
    );
  }

  // Do not create payment sessions when the selected environment cannot
  // receive signed reconciliation events, even for previously saved routes.
  if (!input.connection.webhookSecretRef?.trim()) {
    throw new StripeCommerceCheckoutError(
      "STRIPE_WEBHOOK_CONFIGURATION_REQUIRED",
      `Configure the Stripe ${input.environment} webhook signing secret before starting Checkout.`,
    );
  }

  const createClient =
    dependencies.createClient ??
    defaultStripeClient;

  const resolvePublicOrigin =
    dependencies.resolvePublicOrigin ??
    defaultPublicOrigin;

  const secretKey =
    await readStripeSecretKey({
      buildProjectId:
        input.buildProjectId,
      environment:
        input.environment,
      connection:
        input.connection,
      secretStore:
        input.secretStore,
    });

  const origin =
    resolvePublicOrigin();

  return {
    provider:
      STRIPE_COMMERCE_PROVIDER,

    forOrder(
      order,
    ) {
      return {
        async createPaymentSession(
          request,
        ) {
          if (
            request.orderId !==
              order.id ||
            request.amountMinor !==
              order.totalMinor ||
            request.currency
              .trim()
              .toUpperCase() !==
              order.currency
                .trim()
                .toUpperCase() ||
            request.idempotencyKey
              .trim() !==
              order.id
          ) {
            throw new StripeCommerceCheckoutError(
              "STRIPE_PAYMENT_REQUEST_MISMATCH",
              "Payment request does not match the trusted commerce order.",
            );
          }

          assertTrustedStripeTotal(
            order,
          );

          const expiresAt =
            stripeCheckoutExpiresAt(
              order,
              input.environment,
            );

          const urls =
            returnUrls({
              origin,
              buildProjectId:
                input.buildProjectId,
              environment:
                input.environment,
              orderId:
                order.id,
            });

          const stripe =
            createClient(
              secretKey,
            );

          const session =
            await stripe
              .checkout
              .sessions
              .create(
                {
                  mode:
                    "payment",
                  success_url:
                    urls.successUrl,
                  cancel_url:
                    urls.cancelUrl,
                  expires_at:
                    expiresAt,
                  client_reference_id:
                    order.id,
                  metadata: {
                    zoebuildOrderId:
                      order.id,
                    zoebuildProjectId:
                      input.buildProjectId,
                  },
                  payment_intent_data: {
                    metadata: {
                      zoebuildOrderId:
                        order.id,
                      zoebuildProjectId:
                        input.buildProjectId,
                    },
                  },
                  line_items:
                    order.items.map(
                      (
                        item,
                      ) => ({
                        quantity:
                          item.quantity,
                        price_data: {
                          currency:
                            order.currency
                              .toLowerCase(),
                          unit_amount:
                            item.unitPriceMinor,
                          product_data: {
                            name:
                              stripeLineName(
                                item,
                              ),
                            metadata: {
                              zoebuildMerchandiseId:
                                item.merchandiseId,
                            },
                          },
                        },
                      }),
                    ),
                },
                {
                  idempotencyKey:
                    request.idempotencyKey,
                },
              );

          const url =
            session.url?.trim();

          if (
            !url ||
            !/^https:\/\//i.test(
              url,
            )
          ) {
            throw new StripeCommerceCheckoutError(
              "STRIPE_CHECKOUT_URL_INVALID",
              "Stripe did not return a valid hosted checkout URL.",
            );
          }

          const remoteResourceId =
            session.id.trim();

          if (!remoteResourceId) {
            throw new StripeCommerceCheckoutError(
              "STRIPE_SESSION_ID_INVALID",
              "Stripe did not return a checkout session id.",
            );
          }

          return {
            remoteResourceId,
            redirectUrl:
              url,
            expiresAt:
              order.checkoutExpiresAt,
          };
        },
      };
    },
  };
}
