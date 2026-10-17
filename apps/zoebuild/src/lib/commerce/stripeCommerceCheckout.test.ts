import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  BuildSecretJsonValue,
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  createStripeCommerceCheckoutExecutor,
} from "./stripeCommerceCheckout";

import type {
  TrustedCommerceOrderSnapshot,
} from "./nativeCommerceCheckout";

const order:
  TrustedCommerceOrderSnapshot =
    {
      id:
        "order_123",
      cartId:
        "cart_123",
      currency:
        "USD",
      subtotalMinor:
        3500,
      discountMinor:
        0,
      taxMinor:
        0,
      shippingMinor:
        0,
      totalMinor:
        3500,
      paymentProvider:
        "stripe",
      paymentProviderRef:
        null,
      items: [
        {
          merchandiseId:
            "variant_1",
          title:
            "Zoé Shirt",
          variantTitle:
            "Medium",
          sku:
            "SHIRT-M",
          quantity:
            2,
          unitPriceMinor:
            1000,
          lineTotalMinor:
            2000,
        },
        {
          merchandiseId:
            "variant_2",
          title:
            "Zoé Hat",
          variantTitle:
            "",
          sku:
            "HAT",
          quantity:
            1,
          unitPriceMinor:
            1500,
          lineTotalMinor:
            1500,
        },
      ],
    };

function secretStore(
  value:
    BuildSecretJsonValue,
) {
  const calls:
    unknown[] =
      [];

  const store:
    BuildSecretStore =
      {
        async put() {
          throw new Error(
            "not used",
          );
        },

        async read(
          input,
        ) {
          calls.push(
            input,
          );

          return value;
        },

        async delete() {
          throw new Error(
            "not used",
          );
        },
      };

  return {
    store,
    calls,
  };
}

function connection(
  secretRef =
    "zoebuild-secret:v1:11111111-1111-4111-8111-111111111111",
) {
  return {
    id:
      "connection_1",
    externalAccountRef:
      "acct_123",
    credentialsSecretRef:
      secretRef,
    webhookSecretRef:
      null,
    config:
      null,
  } as const;
}

describe(
  "Stripe commerce checkout executor",
  () => {
    it(
      "creates hosted checkout entirely from trusted order data",
      async () => {
        const secret =
          secretStore({
            secretKey:
              "sk_test_example",
          });

        const creates:
          any[] =
            [];

        const executor =
          createStripeCommerceCheckoutExecutor({
            resolvePublicOrigin:
              () =>
                "http://localhost:3004",
            createClient:
              () => ({
                checkout: {
                  sessions: {
                    async create(
                      params,
                      options,
                    ) {
                      creates.push({
                        params,
                        options,
                      });

                      return {
                        id:
                          "cs_test_123",
                        url:
                          "https://checkout.stripe.com/c/pay/cs_test_123",
                      };
                    },
                  },
                },
              }),
          });

        await executor.preflight?.({
          buildProjectId:
            "project_1",
          environment:
            "test",
          connection:
            connection(),
          secretStore:
            secret.store,
        });

        const result =
          await executor.begin({
            buildProjectId:
              "project_1",
            environment:
              "test",
            connection:
              connection(),
            secretStore:
              secret.store,
            order,
            idempotencyKey:
              order.id,
          });

        expect(
          result,
        ).toEqual({
          providerRef:
            "cs_test_123",
          url:
            "https://checkout.stripe.com/c/pay/cs_test_123",
        });

        expect(
          creates,
        ).toHaveLength(
          1,
        );

        expect(
          creates[0].options,
        ).toEqual({
          idempotencyKey:
            "order_123",
        });

        expect(
          creates[0].params.mode,
        ).toBe(
          "payment",
        );

        expect(
          creates[0].params.client_reference_id,
        ).toBe(
          "order_123",
        );

        expect(
          creates[0].params.line_items,
        ).toEqual([
          {
            quantity:
              2,
            price_data: {
              currency:
                "usd",
              unit_amount:
                1000,
              product_data: {
                name:
                  "Zoé Shirt — Medium",
                metadata: {
                  zoebuildMerchandiseId:
                    "variant_1",
                },
              },
            },
          },
          {
            quantity:
              1,
            price_data: {
              currency:
                "usd",
              unit_amount:
                1500,
              product_data: {
                name:
                  "Zoé Hat",
                metadata: {
                  zoebuildMerchandiseId:
                    "variant_2",
                },
              },
            },
          },
        ]);

        expect(
          creates[0].params.success_url,
        ).toContain(
          "/projects/project_1",
        );

        expect(
          creates[0].params.cancel_url,
        ).toContain(
          "/projects/project_1",
        );

        expect(
          secret.calls,
        ).toEqual([
          {
            buildProjectId:
              "project_1",
            secretRef:
              connection()
                .credentialsSecretRef,
          },
          {
            buildProjectId:
              "project_1",
            secretRef:
              connection()
                .credentialsSecretRef,
          },
        ]);
      },
    );

    it(
      "fails closed when test routing is paired with a live key",
      async () => {
        const secret =
          secretStore({
            secretKey:
              "sk_live_wrong_environment",
          });

        const executor =
          createStripeCommerceCheckoutExecutor({
            resolvePublicOrigin:
              () =>
                "http://localhost:3004",
          });

        await expect(
          executor.preflight?.({
            buildProjectId:
              "project_1",
            environment:
              "test",
            connection:
              connection(),
            secretStore:
              secret.store,
          }),
        ).rejects.toMatchObject({
          code:
            "STRIPE_ENVIRONMENT_MISMATCH",
        });
      },
    );

    it(
      "fails closed when live routing is paired with a test key",
      async () => {
        const secret =
          secretStore({
            secretKey:
              "sk_test_wrong_environment",
          });

        const executor =
          createStripeCommerceCheckoutExecutor({
            resolvePublicOrigin:
              () =>
                "https://build.zoeskoul.com",
          });

        await expect(
          executor.preflight?.({
            buildProjectId:
              "project_1",
            environment:
              "live",
            connection:
              connection(),
            secretStore:
              secret.store,
          }),
        ).rejects.toMatchObject({
          code:
            "STRIPE_ENVIRONMENT_MISMATCH",
        });
      },
    );

    it(
      "requires an opaque credentialsSecretRef",
      async () => {
        const secret =
          secretStore({
            secretKey:
              "sk_test_example",
          });

        const executor =
          createStripeCommerceCheckoutExecutor({
            resolvePublicOrigin:
              () =>
                "http://localhost:3004",
          });

        await expect(
          executor.preflight?.({
            buildProjectId:
              "project_1",
            environment:
              "test",
            connection:
              connection(
                "",
              ),
            secretStore:
              secret.store,
          }),
        ).rejects.toMatchObject({
          code:
            "STRIPE_CREDENTIALS_REQUIRED",
        });
      },
    );

    it(
      "refuses trusted totals that Stripe line items cannot yet represent",
      async () => {
        const secret =
          secretStore({
            secretKey:
              "sk_test_example",
          });

        const executor =
          createStripeCommerceCheckoutExecutor({
            resolvePublicOrigin:
              () =>
                "http://localhost:3004",
            createClient:
              () => ({
                checkout: {
                  sessions: {
                    async create() {
                      throw new Error(
                        "must not reach Stripe",
                      );
                    },
                  },
                },
              }),
          });

        await expect(
          executor.begin({
            buildProjectId:
              "project_1",
            environment:
              "test",
            connection:
              connection(),
            secretStore:
              secret.store,
            order: {
              ...order,
              taxMinor:
                100,
              totalMinor:
                3600,
            },
            idempotencyKey:
              order.id,
          }),
        ).rejects.toMatchObject({
          code:
            "STRIPE_ORDER_ADJUSTMENTS_UNSUPPORTED",
        });
      },
    );
  },
);
