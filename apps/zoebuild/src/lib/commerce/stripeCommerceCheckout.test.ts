import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type Stripe from "stripe";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  prepareStripeCommercePayments,
} from "./stripeCommerceCheckout";
import type {
  TrustedCommerceOrderSnapshot,
} from "./nativeCommerceCheckout";

function connection() {
  return {
    id:
      "connection_1",
    externalAccountRef:
      "acct_test_1",
    credentialsSecretRef:
      "secret_ref_1",
    webhookSecretRef:
      null,
    config:
      null,
  };
}

function secretStore(
  secretKey =
    "sk_test_example",
) {
  const read =
    vi.fn(
      async () => ({
        secretKey,
      }),
    );

  return {
    read,
    value: {
      read,
    } as unknown as
      BuildSecretStore,
  };
}

function trustedOrder(
  overrides:
    Partial<
      TrustedCommerceOrderSnapshot
    > =
      {},
):
  TrustedCommerceOrderSnapshot {
  return {
    id:
      "order_1",
    cartId:
      "cart_1",
    currency:
      "USD",
    subtotalMinor:
      1800,
    discountMinor:
      0,
    taxMinor:
      0,
    shippingMinor:
      0,
    totalMinor:
      1800,
    paymentProvider:
      "stripe",
    paymentEnvironment:
      "test",
    paymentProviderRef:
      null,
    checkoutExpiresAt:
      new Date(
        Date.now() +
          30 * 60 * 1000,
      ),
    items: [
      {
        merchandiseId:
          "variant_1",
        title:
          "Zoé Shirt",
        variantTitle:
          "Medium",
        sku:
          "ZOE-M",
        quantity:
          2,
        unitPriceMinor:
          900,
        lineTotalMinor:
          1800,
      },
    ],
    ...overrides,
  };
}

function paymentRequest(
  order:
    TrustedCommerceOrderSnapshot,
) {
  return {
    orderId:
      order.id,
    amountMinor:
      order.totalMinor,
    currency:
      order.currency,
    idempotencyKey:
      order.id,
  };
}

describe(
  "Stripe shared commerce payments adapter",
  () => {
    it(
      "creates a hosted payment session through the shared payment contract",
      async () => {
        const secrets =
          secretStore();

        const create =
          vi.fn(
            async (
              _params:
                Stripe.Checkout.SessionCreateParams,
              _options?:
                Stripe.RequestOptions,
            ) => ({
              id:
                "cs_test_123",
              url:
                "https://checkout.stripe.com/c/pay/cs_test_123",
            }),
          );

        const prepared =
          await prepareStripeCommercePayments(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection:
                connection(),
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      create,
                    },
                  },
                }),
              resolvePublicOrigin:
                () =>
                  "https://build.zoeskoul.com",
            },
          );

        const order =
          trustedOrder();

        await expect(
          prepared
            .forOrder(
              order,
            )
            .createPaymentSession(
              paymentRequest(
                order,
              ),
            ),
        ).resolves.toEqual({
          remoteResourceId:
            "cs_test_123",
          redirectUrl:
            "https://checkout.stripe.com/c/pay/cs_test_123",
          expiresAt:
            order.checkoutExpiresAt,
        });

        expect(
          secrets.read,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          create,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          params,
          options,
        ] =
          create.mock.calls[0]!;

        expect(
          params.client_reference_id,
        ).toBe(
          "order_1",
        );

        expect(
          params.metadata,
        ).toMatchObject({
          zoebuildOrderId:
            "order_1",
          zoebuildProjectId:
            "project_1",
        });

        expect(
          options,
        ).toEqual({
          idempotencyKey:
            "order_1",
        });
      },
    );

    it(
      "fails before order execution when credentials do not match the routed environment",
      async () => {
        const secrets =
          secretStore(
            "sk_live_example",
          );

        await expect(
          prepareStripeCommercePayments(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection:
                connection(),
              secretStore:
                secrets.value,
            },
            {
              resolvePublicOrigin:
                () =>
                  "https://build.zoeskoul.com",
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_ENVIRONMENT_MISMATCH",
        });
      },
    );

    it(
      "requires secure server credentials during provider preparation",
      async () => {
        await expect(
          prepareStripeCommercePayments(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection:
                connection(),
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_SERVER_CONTEXT_REQUIRED",
        });
      },
    );

    it(
      "rejects a payment request that does not match the trusted order",
      async () => {
        const secrets =
          secretStore();

        const create =
          vi.fn();

        const prepared =
          await prepareStripeCommercePayments(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection:
                connection(),
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      create,
                    },
                  },
                }),
              resolvePublicOrigin:
                () =>
                  "https://build.zoeskoul.com",
            },
          );

        const order =
          trustedOrder();

        await expect(
          prepared
            .forOrder(
              order,
            )
            .createPaymentSession({
              ...paymentRequest(
                order,
              ),
              amountMinor:
                999,
            }),
        ).rejects.toMatchObject({
          code:
            "STRIPE_PAYMENT_REQUEST_MISMATCH",
        });

        expect(
          create,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects unsupported trusted order adjustments before reaching Stripe",
      async () => {
        const secrets =
          secretStore();

        const create =
          vi.fn();

        const prepared =
          await prepareStripeCommercePayments(
            {
              buildProjectId:
                "project_1",
              environment:
                "test",
              connection:
                connection(),
              secretStore:
                secrets.value,
            },
            {
              createClient:
                () => ({
                  checkout: {
                    sessions: {
                      create,
                    },
                  },
                }),
              resolvePublicOrigin:
                () =>
                  "https://build.zoeskoul.com",
            },
          );

        const order =
          trustedOrder({
            discountMinor:
              100,
            totalMinor:
              1700,
          });

        await expect(
          prepared
            .forOrder(
              order,
            )
            .createPaymentSession(
              paymentRequest(
                order,
              ),
            ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_ORDER_ADJUSTMENTS_UNSUPPORTED",
        });

        expect(
          create,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
