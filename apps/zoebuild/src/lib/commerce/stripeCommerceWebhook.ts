import "server-only";

import type Stripe from "stripe";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretJsonValue,
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export const STRIPE_COMMERCE_WEBHOOK_EVENTS =
  [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ] as const;

export type StripeCommerceWebhookEventType =
  (typeof STRIPE_COMMERCE_WEBHOOK_EVENTS)[number];

export type StripeCommerceWebhookConnection =
  Readonly<{
    id: string;
    environment:
      CommerceProviderEnvironment;
    status: string;
    credentialsSecretRef:
      string | null;
    webhookSecretRef:
      string | null;
  }>;

export type StripeCommerceWebhookResult =
  Readonly<{
    status:
      | "ignored"
      | "pending"
      | "paid"
      | "failed"
      | "expired"
      | "already-processed";
    orderId:
      string | null;
  }>;

export class StripeCommerceWebhookError
  extends Error {
  readonly code:
    string;

  readonly status:
    number;

  constructor(
    code:
      string,
    message:
      string,
    status =
      400,
  ) {
    super(
      message,
    );

    this.name =
      "StripeCommerceWebhookError";

    this.code =
      code;

    this.status =
      status;
  }
}

function record(
  value:
    BuildSecretJsonValue,
): Readonly<
  Record<
    string,
    BuildSecretJsonValue
  >
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
        Readonly<
          Record<
            string,
            BuildSecretJsonValue
          >
        >
    : null;
}

function secretString(
  value:
    BuildSecretJsonValue,
  key:
    string,
) {
  const container =
    record(
      value,
    );

  const candidate =
    container?.[
      key
    ];

  return typeof candidate ===
    "string"
    ? candidate.trim()
    : "";
}

function normalizedWebhookSecret(
  raw:
    string,
) {
  const secret =
    raw.trim();

  if (
    secret.length <
      16 ||
    secret.length >
      512 ||
    /\s/.test(
      secret,
    ) ||
    !secret.startsWith(
      "whsec_",
    )
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_SECRET_INVALID",
      "Stripe webhook signing secret is invalid.",
      400,
    );
  }

  return secret;
}

function expectedApiKey(
  apiKey:
    string,
  environment:
    CommerceProviderEnvironment,
) {
  const pattern =
    environment ===
      "test"
      ? /^(sk|rk)_test_/
      : /^(sk|rk)_live_/;

  if (
    !pattern.test(
      apiKey,
    )
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_CREDENTIAL_ENVIRONMENT_MISMATCH",
      "Stripe credentials do not match the webhook environment.",
      409,
    );
  }

  return apiKey;
}

export async function configureStripeCommerceWebhookSecret(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      storeId:
        string;
      environment:
        CommerceProviderEnvironment;
      webhookSecret:
        string;
      secretStore:
        BuildSecretStore;
    }>,
) {
  const buildProjectId =
    input
      .buildProjectId
      .trim();

  const storeId =
    input
      .storeId
      .trim();

  if (
    !buildProjectId ||
    !storeId
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_SCOPE_INVALID",
      "Stripe webhook scope is invalid.",
      400,
    );
  }

  const webhookSecret =
    normalizedWebhookSecret(
      input.webhookSecret,
    );

  const connection =
    await client
      .commerceProviderConnection
      .findUnique({
        where: {
          storeId_provider_environment: {
            storeId,
            provider:
              "stripe",
            environment:
              input.environment,
          },
        },
        select: {
          id:
            true,
          provider:
            true,
          environment:
            true,
          status:
            true,
          webhookSecretRef:
            true,
        },
      });

  if (
    !connection ||
    connection.provider !==
      "stripe" ||
    connection.environment !==
      input.environment ||
    connection.status !==
      "active"
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_CONNECTION_REQUIRED",
      `Connect the Stripe ${input.environment} environment before configuring its webhook.`,
      409,
    );
  }

  const previousRef =
    connection
      .webhookSecretRef
      ?.trim() ??
    "";

  const stored =
    await input
      .secretStore
      .put({
        buildProjectId,
        value: {
          webhookSecret,
        },
      });

  try {
    const changed =
      await client
        .commerceProviderConnection
        .updateMany({
          where: {
            id:
              connection.id,
            provider:
              "stripe",
            environment:
              input.environment,
            status:
              "active",
          },
          data: {
            webhookSecretRef:
              stored.secretRef,
          },
        });

    if (
      changed.count !==
      1
    ) {
      throw new Error(
        "connection changed",
      );
    }
  } catch {
    await input
      .secretStore
      .delete({
        buildProjectId,
        secretRef:
          stored.secretRef,
      })
      .catch(
        () =>
          undefined,
      );

    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_SAVE_FAILED",
      "Stripe webhook signing secret could not be saved.",
      500,
    );
  }

  if (
    previousRef &&
    previousRef !==
      stored.secretRef
  ) {
    await input
      .secretStore
      .delete({
        buildProjectId,
        secretRef:
          previousRef,
      })
      .catch(
        () =>
          undefined,
      );
  }

  return {
    provider:
      "stripe" as const,
    environment:
      input.environment,
    webhookConfigured:
      true as const,
  };
}

export async function readStripeCommerceWebhookSecrets(
  input:
    Readonly<{
      buildProjectId:
        string;
      environment:
        CommerceProviderEnvironment;
      connection:
        StripeCommerceWebhookConnection;
      secretStore:
        BuildSecretStore;
    }>,
) {
  if (
    input.connection.status !==
      "active" ||
    input.connection.environment !==
      input.environment
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_CONNECTION_INVALID",
      "Stripe webhook connection is unavailable.",
      503,
    );
  }

  const credentialsRef =
    input.connection
      .credentialsSecretRef
      ?.trim();

  const webhookRef =
    input.connection
      .webhookSecretRef
      ?.trim();

  if (
    !credentialsRef ||
    !webhookRef
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_NOT_CONFIGURED",
      "Stripe webhook signing is not configured for this environment.",
      503,
    );
  }

  const [
    credentials,
    webhook,
  ] =
    await Promise.all([
      input.secretStore.read({
        buildProjectId:
          input.buildProjectId,
        secretRef:
          credentialsRef,
      }),
      input.secretStore.read({
        buildProjectId:
          input.buildProjectId,
        secretRef:
          webhookRef,
      }),
    ]);

  const apiKey =
    expectedApiKey(
      secretString(
        credentials,
        "secretKey",
      ),
      input.environment,
    );

  const webhookSecret =
    normalizedWebhookSecret(
      secretString(
        webhook,
        "webhookSecret",
      ),
    );

  return {
    apiKey,
    webhookSecret,
  };
}

function orderIdFromSession(
  session:
    Stripe.Checkout.Session,
) {
  const metadataOrderId =
    session
      .metadata
      ?.zoebuildOrderId
      ?.trim() ??
    "";

  const referenceOrderId =
    session
      .client_reference_id
      ?.trim() ??
    "";

  if (
    !metadataOrderId ||
    !referenceOrderId ||
    metadataOrderId !==
      referenceOrderId
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_ORDER_ID_INVALID",
      "Stripe Checkout order metadata is invalid.",
      409,
    );
  }

  return metadataOrderId;
}

function assertSessionEnvironment(
  session:
    Stripe.Checkout.Session,
  environment:
    CommerceProviderEnvironment,
) {
  const expectedLive =
    environment ===
    "live";

  if (
    Boolean(
      session.livemode,
    ) !==
    expectedLive
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_ENVIRONMENT_MISMATCH",
      "Stripe webhook environment does not match the connected environment.",
      409,
    );
  }
}

function assertSessionOrder(
  input:
    Readonly<{
      buildProjectId:
        string;
      environment:
        CommerceProviderEnvironment;
      order:
        Readonly<{
          id:
            string;
          currency:
            string;
          totalMinor:
            number;
          paymentProvider:
            string | null;
          paymentEnvironment:
            CommerceProviderEnvironment | null;
          paymentProviderRef:
            string | null;
          checkoutExpiresAt:
            Date | null;
        }>;
      session:
        Stripe.Checkout.Session;
    }>,
) {
  const session =
    input.session;

  if (
    session
      .metadata
      ?.zoebuildProjectId
      ?.trim() !==
    input.buildProjectId
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_PROJECT_MISMATCH",
      "Stripe Checkout project metadata does not match the order.",
      409,
    );
  }

  if (
    input.order
      .paymentEnvironment &&
    input.order
      .paymentEnvironment !==
      input.environment
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_ORDER_ENVIRONMENT_MISMATCH",
      "Stripe Checkout environment does not match the trusted order environment.",
      409,
    );
  }

  if (
    input.order
      .paymentProvider !==
      "stripe" ||
    input.order
      .paymentProviderRef !==
      session.id
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_PROVIDER_REFERENCE_MISMATCH",
      "Stripe Checkout session does not match the stored order.",
      409,
    );
  }

  if (
    session.amount_total ===
      null ||
    session.amount_total !==
      input.order.totalMinor
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_AMOUNT_MISMATCH",
      "Stripe Checkout total does not match the trusted order total.",
      409,
    );
  }

  if (
    !session.currency ||
    session.currency
      .toUpperCase() !==
      input.order.currency
        .toUpperCase()
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_CURRENCY_MISMATCH",
      "Stripe Checkout currency does not match the trusted order currency.",
      409,
    );
  }

  if (
    input.order
      .checkoutExpiresAt
  ) {
    const trustedExpiry =
      Math.floor(
        input.order
          .checkoutExpiresAt
          .getTime() /
          1000,
      );

    if (
      Math.abs(
        trustedExpiry -
          session.expires_at,
      ) >
      1
    ) {
      throw new StripeCommerceWebhookError(
        "STRIPE_WEBHOOK_EXPIRY_MISMATCH",
        "Stripe Checkout expiry does not match the trusted reservation expiry.",
        409,
      );
    }
  }
}

const reconciliationOrderSelect =
  {
    id:
      true,
    cartId:
      true,
    status:
      true,
    paymentStatus:
      true,
    currency:
      true,
    totalMinor:
      true,
    paymentProvider:
      true,
    paymentEnvironment:
      true,
    paymentProviderRef:
      true,
    checkoutExpiresAt:
      true,
    placedAt:
      true,
    items: {
      select: {
        variantId:
          true,
        quantity:
          true,
        variant: {
          select: {
            inventory: {
              select: {
                trackQuantity:
                  true,
              },
            },
          },
        },
      },
    },
    inventoryReservations: {
      select: {
        id:
          true,
        inventoryItemId:
          true,
        quantity:
          true,
        status:
          true,
        inventoryItem: {
          select: {
            trackQuantity:
              true,
          },
        },
      },
    },
  } as const;

function alreadyCaptured(
  paymentStatus:
    string,
) {
  return (
    paymentStatus ===
      "paid" ||
    paymentStatus ===
      "partially_refunded" ||
    paymentStatus ===
      "refunded"
  );
}

async function loadOrder(
  client:
    PrismaClient,
  buildProjectId:
    string,
  orderId:
    string,
) {
  return client
    .commerceOrder
    .findFirst({
      where: {
        id:
          orderId,
        store: {
          buildProjectId,
        },
      },
      select:
        reconciliationOrderSelect,
    });
}

async function markTerminalAndReleaseReservations(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      orderId:
        string;
      sessionId:
        string;
      cartStatus:
        "abandoned" |
        "expired";
      resultStatus:
        "failed" |
        "expired";
    }>,
): Promise<
  StripeCommerceWebhookResult
> {
  return client
    .$transaction(
      async (
        tx,
      ) => {
        const current =
          await tx
            .commerceOrder
            .findFirst({
              where: {
                id:
                  input.orderId,
                store: {
                  buildProjectId:
                    input.buildProjectId,
                },
                paymentProvider:
                  "stripe",
                paymentProviderRef:
                  input.sessionId,
              },
              select:
                reconciliationOrderSelect,
            });

        if (!current) {
          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_ORDER_NOT_FOUND",
            "Stripe Checkout order could not be found.",
            404,
          );
        }

        if (
          alreadyCaptured(
            current
              .paymentStatus,
          )
        ) {
          return {
            status:
              "already-processed" as const,
            orderId:
              current.id,
          };
        }

        if (
          current.status ===
            "canceled" &&
          current.paymentStatus ===
            "failed"
        ) {
          return {
            status:
              "already-processed" as const,
            orderId:
              current.id,
          };
        }

        if (
          current.status ===
            "fulfilled"
        ) {
          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_ORDER_STATE_INVALID",
            "Stripe failure cannot reconcile into a fulfilled order.",
            409,
          );
        }

        const transitioned =
          await tx
            .commerceOrder
            .updateMany({
              where: {
                id:
                  current.id,
                paymentProvider:
                  "stripe",
                paymentProviderRef:
                  input.sessionId,
                status:
                  "pending",
                paymentStatus: {
                  in: [
                    "pending",
                    "authorized",
                  ],
                },
              },
              data: {
                status:
                  "canceled",
                paymentStatus:
                  "failed",
              },
            });

        if (
          transitioned.count !==
          1
        ) {
          const latest =
            await tx
              .commerceOrder
              .findUnique({
                where: {
                  id:
                    current.id,
                },
                select: {
                  status:
                    true,
                  paymentStatus:
                    true,
                },
              });

          if (
            latest &&
            (
              alreadyCaptured(
                latest
                  .paymentStatus,
              ) ||
              (
                latest.status ===
                  "canceled" &&
                latest.paymentStatus ===
                  "failed"
              )
            )
          ) {
            return {
              status:
                "already-processed" as const,
              orderId:
                current.id,
            };
          }

          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_RECONCILIATION_CONFLICT",
            "Stripe failure state changed during reconciliation.",
            409,
          );
        }

        for (
          const reservation of
          current.inventoryReservations ??
          []
        ) {
          if (
            reservation.status ===
              "committed"
          ) {
            throw new StripeCommerceWebhookError(
              "STRIPE_WEBHOOK_RESERVATION_STATE_INVALID",
              "Committed inventory cannot be released from a failed checkout.",
              409,
            );
          }

          if (
            reservation.status !==
              "reserved"
          ) {
            continue;
          }

          const released =
            await tx
              .commerceInventoryReservation
              .updateMany({
                where: {
                  id:
                    reservation.id,
                  status:
                    "reserved",
                },
                data: {
                  status:
                    "released",
                },
              });

          if (
            released.count !==
            1
          ) {
            throw new StripeCommerceWebhookError(
              "STRIPE_WEBHOOK_RESERVATION_RELEASE_CONFLICT",
              "Checkout inventory reservation changed during release.",
              409,
            );
          }

          if (
            !reservation
              .inventoryItem
              .trackQuantity
          ) {
            continue;
          }

          const inventory =
            await tx
              .commerceInventoryItem
              .updateMany({
                where: {
                  id:
                    reservation.inventoryItemId,
                  trackQuantity:
                    true,
                  reservedQuantity: {
                    gte:
                      reservation.quantity,
                  },
                },
                data: {
                  reservedQuantity: {
                    decrement:
                      reservation.quantity,
                  },
                },
              });

          if (
            inventory.count !==
            1
          ) {
            throw new StripeCommerceWebhookError(
              "STRIPE_WEBHOOK_RESERVATION_RELEASE_FAILED",
              "Reserved inventory could not be released.",
              409,
            );
          }
        }

        if (
          current.cartId
        ) {
          await tx
            .commerceCart
            .updateMany({
              where: {
                id:
                  current.cartId,
                status:
                  "converted",
              },
              data: {
                status:
                  input.cartStatus,
              },
            });
        }

        return {
          status:
            input.resultStatus,
          orderId:
            current.id,
        };
      },
    );
}

async function markPaidAndCommitInventory(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      orderId:
        string;
      sessionId:
        string;
    }>,
): Promise<
  StripeCommerceWebhookResult
> {
  return client
    .$transaction(
      async (
        tx,
      ) => {
        const current =
          await tx
            .commerceOrder
            .findFirst({
              where: {
                id:
                  input.orderId,
                store: {
                  buildProjectId:
                    input.buildProjectId,
                },
                paymentProvider:
                  "stripe",
                paymentProviderRef:
                  input.sessionId,
              },
              select:
                reconciliationOrderSelect,
            });

        if (!current) {
          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_ORDER_NOT_FOUND",
            "Stripe Checkout order could not be found.",
            404,
          );
        }

        if (
          alreadyCaptured(
            current
              .paymentStatus,
          )
        ) {
          return {
            status:
              "already-processed" as const,
            orderId:
              current.id,
          };
        }

        if (
          current.status ===
            "canceled" ||
          current.status ===
            "fulfilled"
        ) {
          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_ORDER_STATE_INVALID",
            "Stripe payment cannot reconcile into the current order state.",
            409,
          );
        }

        const transitioned =
          await tx
            .commerceOrder
            .updateMany({
              where: {
                id:
                  current.id,
                paymentProvider:
                  "stripe",
                paymentProviderRef:
                  input.sessionId,
                status:
                  "pending",
                paymentStatus: {
                  in: [
                    "pending",
                    "authorized",
                    "failed",
                  ],
                },
              },
              data: {
                status:
                  "confirmed",
                paymentStatus:
                  "paid",
                placedAt:
                  current.placedAt ??
                  new Date(),
              },
            });

        if (
          transitioned.count !==
          1
        ) {
          const latest =
            await tx
              .commerceOrder
              .findUnique({
                where: {
                  id:
                    current.id,
                },
                select: {
                  paymentStatus:
                    true,
                },
              });

          if (
            latest &&
            alreadyCaptured(
              latest
                .paymentStatus,
            )
          ) {
            return {
              status:
                "already-processed" as const,
              orderId:
                current.id,
            };
          }

          throw new StripeCommerceWebhookError(
            "STRIPE_WEBHOOK_RECONCILIATION_CONFLICT",
            "Stripe payment state changed during reconciliation.",
            409,
          );
        }

        const reservations =
          current.inventoryReservations ??
          [];

        if (
          reservations.length >
          0
        ) {
          for (
            const reservation of
            reservations
          ) {
            if (
              reservation.status !==
                "reserved"
            ) {
              throw new StripeCommerceWebhookError(
                "STRIPE_WEBHOOK_RESERVATION_STATE_INVALID",
                "Paid checkout inventory reservation is not available to commit.",
                409,
              );
            }

            if (
              reservation
                .inventoryItem
                .trackQuantity
            ) {
              const committed =
                await tx
                  .commerceInventoryItem
                  .updateMany({
                    where: {
                      id:
                        reservation.inventoryItemId,
                      trackQuantity:
                        true,
                      quantity: {
                        gte:
                          reservation.quantity,
                      },
                      reservedQuantity: {
                        gte:
                          reservation.quantity,
                      },
                    },
                    data: {
                      quantity: {
                        decrement:
                          reservation.quantity,
                      },
                      reservedQuantity: {
                        decrement:
                          reservation.quantity,
                      },
                    },
                  });

              if (
                committed.count !==
                1
              ) {
                throw new StripeCommerceWebhookError(
                  "STRIPE_WEBHOOK_INVENTORY_COMMIT_FAILED",
                  "Paid order reserved inventory could not be committed.",
                  409,
                );
              }
            }

            const committedReservation =
              await tx
                .commerceInventoryReservation
                .updateMany({
                  where: {
                    id:
                      reservation.id,
                    status:
                      "reserved",
                  },
                  data: {
                    status:
                      "committed",
                  },
                });

            if (
              committedReservation.count !==
              1
            ) {
              throw new StripeCommerceWebhookError(
                "STRIPE_WEBHOOK_RESERVATION_COMMIT_CONFLICT",
                "Paid order reservation changed during inventory commit.",
                409,
              );
            }
          }
        } else {
          for (
            const item of
            current.items
          ) {
            if (
              !item.variantId ||
              !item.variant
                ?.inventory
                ?.trackQuantity
            ) {
              continue;
            }

            const committed =
              await tx
                .commerceInventoryItem
                .updateMany({
                  where: {
                    variantId:
                      item.variantId,
                    trackQuantity:
                      true,
                    quantity: {
                      gte:
                        item.quantity,
                    },
                  },
                  data: {
                    quantity: {
                      decrement:
                        item.quantity,
                    },
                  },
                });

            if (
              committed.count !==
              1
            ) {
              throw new StripeCommerceWebhookError(
                "STRIPE_WEBHOOK_INVENTORY_COMMIT_FAILED",
                "Paid legacy order inventory could not be committed.",
                409,
              );
            }
          }
        }

        return {
          status:
            "paid" as const,
          orderId:
            current.id,
        };
      },
    );
}

export async function reconcileStripeCommerceWebhookEvent(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      environment:
        CommerceProviderEnvironment;
      event:
        Stripe.Event;
    }>,
): Promise<
  StripeCommerceWebhookResult
> {
  if (
    !STRIPE_COMMERCE_WEBHOOK_EVENTS.includes(
      input.event.type as
        StripeCommerceWebhookEventType,
    )
  ) {
    return {
      status:
        "ignored",
      orderId:
        null,
    };
  }

  const expectedLive =
    input.environment ===
    "live";

  if (
    input.event.livemode !==
    expectedLive
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_EVENT_ENVIRONMENT_MISMATCH",
      "Stripe event livemode does not match the webhook environment.",
      409,
    );
  }

  const session =
    input.event
      .data
      .object as
      Stripe.Checkout.Session;

  if (
    session.object !==
    "checkout.session"
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_OBJECT_INVALID",
      "Stripe webhook object is not a Checkout Session.",
      400,
    );
  }

  assertSessionEnvironment(
    session,
    input.environment,
  );

  const orderId =
    orderIdFromSession(
      session,
    );

  const order =
    await loadOrder(
      client,
      input.buildProjectId,
      orderId,
    );

  if (!order) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_ORDER_NOT_FOUND",
      "Stripe Checkout order could not be found.",
      404,
    );
  }

  assertSessionOrder({
    buildProjectId:
      input.buildProjectId,
    environment:
      input.environment,
    order,
    session,
  });

  if (
    input.event.type ===
    "checkout.session.expired"
  ) {
    return markTerminalAndReleaseReservations(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        orderId,
        sessionId:
          session.id,
        cartStatus:
          "expired",
        resultStatus:
          "expired",
      },
    );
  }

  if (
    input.event.type ===
    "checkout.session.async_payment_failed"
  ) {
    return markTerminalAndReleaseReservations(
      client,
      {
        buildProjectId:
          input.buildProjectId,
        orderId,
        sessionId:
          session.id,
        cartStatus:
          "abandoned",
        resultStatus:
          "failed",
      },
    );
  }

  if (
    session.payment_status !==
    "paid"
  ) {
    return {
      status:
        "pending",
      orderId,
    };
  }

  if (
    session.status !==
    "complete"
  ) {
    throw new StripeCommerceWebhookError(
      "STRIPE_WEBHOOK_SESSION_STATE_INVALID",
      "Paid Stripe Checkout Session is not complete.",
      409,
    );
  }

  return markPaidAndCommitInventory(
    client,
    {
      buildProjectId:
        input.buildProjectId,
      orderId,
      sessionId:
        session.id,
    },
  );
}
