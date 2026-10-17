import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type Stripe from "stripe";
import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  reconcileStripeCommerceWebhookEvent,
} from "./stripeCommerceWebhook";

const expiry =
  new Date(
    "2100-01-01T00:35:00.000Z",
  );

function checkoutSession(
  overrides:
    Partial<
      Stripe.Checkout.Session
    > =
      {},
): Stripe.Checkout.Session {
  return {
    id:
      "cs_test_reserved",
    object:
      "checkout.session",
    livemode:
      false,
    amount_total:
      1800,
    currency:
      "usd",
    payment_status:
      "paid",
    status:
      "complete",
    expires_at:
      Math.floor(
        expiry.getTime() /
          1000,
      ),
    client_reference_id:
      "order_reserved",
    metadata: {
      zoebuildOrderId:
        "order_reserved",
      zoebuildProjectId:
        "build_1",
    },
    ...overrides,
  } as
    Stripe.Checkout.Session;
}

function stripeEvent(
  type:
    string,
  session =
    checkoutSession(),
): Stripe.Event {
  return {
    id:
      "evt_reserved",
    object:
      "event",
    created:
      1,
    livemode:
      false,
    type,
    data: {
      object:
        session,
    },
  } as
    Stripe.Event;
}

function fakeClient() {
  let paymentStatus =
    "pending";
  let orderStatus =
    "pending";
  let cartStatus =
    "converted";
  let quantity =
    10;
  let reservedQuantity =
    2;
  let reservationStatus =
    "reserved";

  const orderRow =
    () => ({
      id:
        "order_reserved",
      cartId:
        "cart_reserved",
      status:
        orderStatus,
      paymentStatus,
      currency:
        "USD",
      totalMinor:
        1800,
      paymentProvider:
        "stripe",
      paymentEnvironment:
        "test",
      paymentProviderRef:
        "cs_test_reserved",
      checkoutExpiresAt:
        expiry,
      placedAt:
        null,
      items: [
        {
          variantId:
            "variant_1",
          quantity:
            2,
          variant: {
            inventory: {
              trackQuantity:
                true,
            },
          },
        },
      ],
      inventoryReservations: [
        {
          id:
            "reservation_1",
          inventoryItemId:
            "inventory_1",
          quantity:
            2,
          status:
            reservationStatus,
          inventoryItem: {
            trackQuantity:
              true,
          },
        },
      ],
    });

  const commerceOrder = {
    findFirst:
      vi.fn(
        async () =>
          orderRow(),
      ),
    findUnique:
      vi.fn(
        async () => ({
          status:
            orderStatus,
          paymentStatus,
        }),
      ),
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          if (
            input.data
              .paymentStatus ===
            "paid"
          ) {
            if (
              orderStatus !==
                "pending" ||
              paymentStatus ===
                "paid"
            ) {
              return {
                count:
                  0,
              };
            }

            orderStatus =
              "confirmed";
            paymentStatus =
              "paid";

            return {
              count:
                1,
            };
          }

          if (
            input.data
              .paymentStatus ===
            "failed"
          ) {
            if (
              orderStatus !==
                "pending" ||
              (
                paymentStatus !==
                  "pending" &&
                paymentStatus !==
                  "authorized"
              )
            ) {
              return {
                count:
                  0,
              };
            }

            orderStatus =
              "canceled";
            paymentStatus =
              "failed";

            return {
              count:
                1,
            };
          }

          return {
            count:
              0,
          };
        },
      ),
  };

  const commerceInventoryReservation = {
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          if (
            reservationStatus !==
              "reserved"
          ) {
            return {
              count:
                0,
            };
          }

          reservationStatus =
            input.data.status;

          return {
            count:
              1,
          };
        },
      ),
  };

  const commerceInventoryItem = {
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          const sold =
            input.data
              .quantity
              ?.decrement ??
            0;

          const released =
            input.data
              .reservedQuantity
              ?.decrement ??
            0;

          if (
            quantity <
              sold ||
            reservedQuantity <
              released
          ) {
            return {
              count:
                0,
            };
          }

          quantity -=
            sold;
          reservedQuantity -=
            released;

          return {
            count:
              1,
          };
        },
      ),
  };

  const commerceCart = {
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          if (
            cartStatus !==
              "converted"
          ) {
            return {
              count:
                0,
            };
          }

          cartStatus =
            input.data.status;

          return {
            count:
              1,
          };
        },
      ),
  };

  const tx = {
    commerceOrder,
    commerceInventoryReservation,
    commerceInventoryItem,
    commerceCart,
  };

  const client = {
    commerceOrder,
    commerceInventoryReservation,
    commerceInventoryItem,
    commerceCart,
    $transaction:
      vi.fn(
        async (
          callback:
            (
              value:
                typeof tx,
            ) =>
              Promise<
                unknown
              >,
        ) =>
          callback(
            tx,
          ),
      ),
  } as unknown as
    PrismaClient;

  return {
    client,
    commerceInventoryItem,
    get paymentStatus() {
      return paymentStatus;
    },
    get orderStatus() {
      return orderStatus;
    },
    get cartStatus() {
      return cartStatus;
    },
    get quantity() {
      return quantity;
    },
    get reservedQuantity() {
      return reservedQuantity;
    },
    get reservationStatus() {
      return reservationStatus;
    },
  };
}

describe(
  "Stripe commerce reservation lifecycle",
  () => {
    it(
      "commits an owned reservation to sold inventory exactly once",
      async () => {
        const fake =
          fakeClient();

        const first =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                stripeEvent(
                  "checkout.session.completed",
                ),
            },
          );

        expect(
          first.status,
        ).toBe(
          "paid",
        );
        expect(
          fake.orderStatus,
        ).toBe(
          "confirmed",
        );
        expect(
          fake.paymentStatus,
        ).toBe(
          "paid",
        );
        expect(
          fake.quantity,
        ).toBe(
          8,
        );
        expect(
          fake.reservedQuantity,
        ).toBe(
          0,
        );
        expect(
          fake.reservationStatus,
        ).toBe(
          "committed",
        );

        const duplicate =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                stripeEvent(
                  "checkout.session.completed",
                ),
            },
          );

        expect(
          duplicate.status,
        ).toBe(
          "already-processed",
        );
        expect(
          fake.quantity,
        ).toBe(
          8,
        );
        expect(
          fake.reservedQuantity,
        ).toBe(
          0,
        );
        expect(
          fake
            .commerceInventoryItem
            .updateMany,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "releases owned inventory and expires the cart exactly once",
      async () => {
        const fake =
          fakeClient();

        const expired =
          checkoutSession({
            status:
              "expired",
            payment_status:
              "unpaid",
          });

        const first =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                stripeEvent(
                  "checkout.session.expired",
                  expired,
                ),
            },
          );

        expect(
          first.status,
        ).toBe(
          "expired",
        );
        expect(
          fake.orderStatus,
        ).toBe(
          "canceled",
        );
        expect(
          fake.paymentStatus,
        ).toBe(
          "failed",
        );
        expect(
          fake.cartStatus,
        ).toBe(
          "expired",
        );
        expect(
          fake.quantity,
        ).toBe(
          10,
        );
        expect(
          fake.reservedQuantity,
        ).toBe(
          0,
        );
        expect(
          fake.reservationStatus,
        ).toBe(
          "released",
        );

        const duplicate =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                stripeEvent(
                  "checkout.session.expired",
                  expired,
                ),
            },
          );

        expect(
          duplicate.status,
        ).toBe(
          "already-processed",
        );
        expect(
          fake.quantity,
        ).toBe(
          10,
        );
        expect(
          fake.reservedQuantity,
        ).toBe(
          0,
        );
      },
    );

    it(
      "releases owned inventory when asynchronous payment fails",
      async () => {
        const fake =
          fakeClient();

        const result =
          await reconcileStripeCommerceWebhookEvent(
            fake.client,
            {
              buildProjectId:
                "build_1",
              environment:
                "test",
              event:
                stripeEvent(
                  "checkout.session.async_payment_failed",
                  checkoutSession({
                    payment_status:
                      "unpaid",
                  }),
                ),
            },
          );

        expect(
          result.status,
        ).toBe(
          "failed",
        );
        expect(
          fake.cartStatus,
        ).toBe(
          "abandoned",
        );
        expect(
          fake.quantity,
        ).toBe(
          10,
        );
        expect(
          fake.reservedQuantity,
        ).toBe(
          0,
        );
        expect(
          fake.reservationStatus,
        ).toBe(
          "released",
        );
      },
    );
  },
);
