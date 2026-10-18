import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  CommerceCheckoutRequest,
  CommerceCheckoutResult,
  CommerceRuntimeSurface,
  TrustedCommerceOrderLine,
  TrustedCommerceOrderSnapshot,
} from "./commerceRuntimeContracts";

import {
  adoptCommercePaymentProviderRef,
  CommercePaymentProviderRefError,
} from "./commercePaymentProviderRef";

import {
  hashNativeCommerceCartToken,
  NativeCommerceCartError,
  parseNativeCommerceCartToken,
} from "./nativeCommerceCart";

import {
  prepareCommercePaymentCheckout,
} from "./commerceRuntime";
import {
  CommerceProviderResolutionError,
  resolveCommerceProvider,
} from "./commerceProviderResolver";

import {
  ZOESTORE_COMMERCE_PROVIDER,
  type CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export class NativeCommerceCheckoutError
  extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(
      message,
    );

    this.name =
      "NativeCommerceCheckoutError";

    this.code =
      code;

    this.status =
      status;
  }
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<string, unknown>
    : null;
}

function projectId(
  value: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_PROJECT_REQUIRED",
      "A BuildProject id is required.",
      400,
    );
  }

  return normalized;
}

function allowedStoreStatus(
  surface:
    CommerceRuntimeSurface,
  status:
    string,
) {
  return surface ===
    "published"
    ? status ===
        "active"
    : status ===
        "draft" ||
      status ===
        "active";
}

function checkoutUrl(
  value: string,
) {
  let parsed:
    URL;

  try {
    parsed =
      new URL(
        value,
      );
  } catch {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_RESPONSE_INVALID",
      "Payment provider returned an invalid checkout URL.",
      502,
    );
  }

  if (
    parsed.protocol !==
      "https:"
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_RESPONSE_INVALID",
      "Payment provider checkout must use HTTPS.",
      502,
    );
  }

  return parsed.toString();
}

function providerReference(
  value: string,
) {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      512
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_RESPONSE_INVALID",
      "Payment provider returned an invalid checkout reference.",
      502,
    );
  }

  return normalized;
}

export function parseCommerceCheckoutRequest(
  value: unknown,
): CommerceCheckoutRequest {
  const input =
    record(
      value,
    );

  if (!input) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_REQUEST_INVALID",
      "Invalid checkout request.",
      400,
    );
  }

  const keys =
    Object.keys(
      input,
    );

  if (
    keys.length !==
      1 ||
    keys[0] !==
      "cartId"
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_REQUEST_INVALID",
      "Checkout accepts only an opaque cart id.",
      400,
    );
  }

  try {
    return {
      cartId:
        parseNativeCommerceCartToken(
          input.cartId,
        ),
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      NativeCommerceCartError
    ) {
      throw new NativeCommerceCheckoutError(
        error.code,
        error.message,
        error.status,
      );
    }

    throw error;
  }
}

export const COMMERCE_CHECKOUT_RESERVATION_TTL_MS =
  35 *
  60 *
  1000;

type CheckoutCartRow =
  Readonly<{
    id: string;
    status: string;
    currency: string;
    customerId: string | null;
    items:
      readonly Readonly<{
        quantity: number;
        variant:
          Readonly<{
            id: string;
            title: string;
            sku: string | null;
            priceMinor: number;
            availableForSale: boolean;
            product:
              Readonly<{
                storeId: string;
                status: string;
                title: string;
              }>;
            inventory:
              | Readonly<{
                  id: string;
                  quantity: number;
                  reservedQuantity: number;
                  trackQuantity: boolean;
                }>
              | null;
          }>;
      }>[];
  }>;

function trustedLines(
  storeId: string,
  cart:
    CheckoutCartRow,
): readonly TrustedCommerceOrderLine[] {
  if (
    cart.items.length ===
      0
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CART_EMPTY",
      "Cart is empty.",
      409,
    );
  }

  return cart.items.map(
    (
      item,
    ) => {
      const variant =
        item.variant;

      if (
        !variant.availableForSale ||
        variant.product.storeId !==
          storeId ||
        variant.product.status !==
          "active"
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_MERCHANDISE_UNAVAILABLE",
          "One or more cart items are unavailable.",
          409,
        );
      }

      if (
        variant.inventory
          ?.trackQuantity
      ) {
        const available =
          Math.max(
            0,
            variant.inventory.quantity -
              variant.inventory.reservedQuantity,
          );

        if (
          item.quantity >
          available
        ) {
          throw new NativeCommerceCheckoutError(
            "COMMERCE_INVENTORY_UNAVAILABLE",
            "One or more cart items are no longer available in the requested quantity.",
            409,
          );
        }
      }

      return {
        merchandiseId:
          variant.id,
        title:
          variant.product.title,
        variantTitle:
          variant.title,
        sku:
          variant.sku,
        quantity:
          item.quantity,
        unitPriceMinor:
          variant.priceMinor,
        lineTotalMinor:
          variant.priceMinor *
          item.quantity,
      };
    },
  );
}

function publicOrder(
  order:
    Readonly<{
      id: string;
      cartId: string | null;
      status: string;
      paymentStatus: string;
      currency: string;
      subtotalMinor: number;
      discountMinor: number;
      taxMinor: number;
      shippingMinor: number;
      totalMinor: number;
      paymentProvider: string | null;
      paymentEnvironment:
        CommerceProviderEnvironment | null;
      paymentProviderRef: string | null;
      checkoutExpiresAt: Date | null;
      items:
        readonly Readonly<{
          variantId: string | null;
          title: string;
          variantTitle: string | null;
          sku: string | null;
          quantity: number;
          unitPriceMinor: number;
          lineTotalMinor: number;
        }>[];
    }>,
  expectedProvider:
    string,
  expectedEnvironment:
    CommerceProviderEnvironment,
): TrustedCommerceOrderSnapshot {
  if (
    !order.cartId ||
    order.status !==
      "pending" ||
    (
      order.paymentStatus !==
        "pending" &&
      order.paymentStatus !==
        "authorized"
    ) ||
    order.paymentProvider !==
      expectedProvider ||
    order.paymentEnvironment !==
      expectedEnvironment ||
    !order.checkoutExpiresAt
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_ALREADY_STARTED",
      "Checkout has already entered a terminal or incompatible payment state.",
      409,
    );
  }

  if (
    order.checkoutExpiresAt
      .getTime() <=
    Date.now()
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_EXPIRED",
      "Checkout reservation has expired.",
      409,
    );
  }

  return {
    id:
      order.id,
    cartId:
      order.cartId,
    currency:
      order.currency,
    subtotalMinor:
      order.subtotalMinor,
    discountMinor:
      order.discountMinor,
    taxMinor:
      order.taxMinor,
    shippingMinor:
      order.shippingMinor,
    totalMinor:
      order.totalMinor,
    paymentProvider:
      expectedProvider,
    paymentEnvironment:
      expectedEnvironment,
    paymentProviderRef:
      order.paymentProviderRef,
    checkoutExpiresAt:
      order.checkoutExpiresAt,
    items:
      order.items.map(
        (
          item,
        ) => ({
          merchandiseId:
            item.variantId ??
            "",
          title:
            item.title,
          variantTitle:
            item.variantTitle ??
            "",
          sku:
            item.sku,
          quantity:
            item.quantity,
          unitPriceMinor:
            item.unitPriceMinor,
          lineTotalMinor:
            item.lineTotalMinor,
        }),
      ),
  };
}

const orderItemOrderBy = [
  {
    createdAt:
      "asc" as const,
  },
  {
    id:
      "asc" as const,
  },
];

const orderSelect = {
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
  subtotalMinor:
    true,
  discountMinor:
    true,
  taxMinor:
    true,
  shippingMinor:
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
  items: {
    orderBy:
      orderItemOrderBy,
    select: {
      variantId:
        true,
      title:
        true,
      variantTitle:
        true,
      sku:
        true,
      quantity:
        true,
      unitPriceMinor:
        true,
      lineTotalMinor:
        true,
    },
  },
} as const;

async function createOrReuseOrderSnapshot(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId: string;
      surface:
        CommerceRuntimeSurface;
      cartToken: string;
      paymentProvider: string;
      paymentEnvironment:
        CommerceProviderEnvironment;
    }>,
): Promise<
  TrustedCommerceOrderSnapshot
> {
  return client.$transaction(
    async (
      tx,
    ) => {
      const store =
        await tx
          .commerceStore
          .findUnique({
            where: {
              buildProjectId:
                projectId(
                  input.buildProjectId,
                ),
            },
            select: {
              id:
                true,
              status:
                true,
              defaultCurrency:
                true,
            },
          });

      if (
        !store ||
        !allowedStoreStatus(
          input.surface,
          store.status,
        )
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_STORE_NOT_FOUND",
          "Store not found.",
          404,
        );
      }

      const cart =
        await tx
          .commerceCart
          .findFirst({
            where: {
              storeId:
                store.id,
              publicTokenHash:
                hashNativeCommerceCartToken(
                  input.cartToken,
                ),
            },
            select: {
              id:
                true,
              status:
                true,
              currency:
                true,
              customerId:
                true,
              order: {
                select:
                  orderSelect,
              },
              items: {
                orderBy: [
                  {
                    createdAt:
                      "asc",
                  },
                  {
                    id:
                      "asc",
                  },
                ],
                select: {
                  quantity:
                    true,
                  variant: {
                    select: {
                      id:
                        true,
                      title:
                        true,
                      sku:
                        true,
                      priceMinor:
                        true,
                      availableForSale:
                        true,
                      product: {
                        select: {
                          storeId:
                            true,
                          status:
                            true,
                          title:
                            true,
                        },
                      },
                      inventory: {
                        select: {
                          id:
                            true,
                          quantity:
                            true,
                          reservedQuantity:
                            true,
                          trackQuantity:
                            true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

      if (!cart) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_CART_NOT_FOUND",
          "Cart not found.",
          404,
        );
      }

      if (
        cart.order
      ) {
        return publicOrder(
          cart.order,
          input.paymentProvider,
          input.paymentEnvironment,
        );
      }

      if (
        cart.status !==
          "active"
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_CART_NOT_ACTIVE",
          "Cart is no longer active.",
          409,
        );
      }

      if (
        cart.currency !==
          store.defaultCurrency
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_CART_CURRENCY_INVALID",
          "Cart currency no longer matches the store.",
          409,
        );
      }

      const lines =
        trustedLines(
          store.id,
          cart as CheckoutCartRow,
        );

      const reservationLines =
        cart.items.flatMap(
          (
            item,
          ) => {
            const inventory =
              item.variant
                .inventory;

            return inventory
              ?.trackQuantity
              ? [
                  {
                    inventoryItemId:
                      inventory.id,
                    quantity:
                      item.quantity,
                    expectedQuantity:
                      inventory.quantity,
                    expectedReservedQuantity:
                      inventory.reservedQuantity,
                  },
                ]
              : [];
          },
        );

      const subtotalMinor =
        lines.reduce(
          (
            total,
            line,
          ) =>
            total +
            line.lineTotalMinor,
          0,
        );

      const requestedExpiry =
        new Date(
          Date.now() +
            COMMERCE_CHECKOUT_RESERVATION_TTL_MS,
        );

      const order =
        await tx
          .commerceOrder
          .upsert({
            where: {
              cartId:
                cart.id,
            },
            create: {
              storeId:
                store.id,
              customerId:
                cart.customerId,
              cartId:
                cart.id,
              status:
                "pending",
              paymentStatus:
                "pending",
              currency:
                cart.currency,
              subtotalMinor,
              discountMinor:
                0,
              taxMinor:
                0,
              shippingMinor:
                0,
              totalMinor:
                subtotalMinor,
              paymentProvider:
                input.paymentProvider,
              paymentEnvironment:
                input.paymentEnvironment,
              paymentProviderRef:
                null,
              checkoutExpiresAt:
                requestedExpiry,
              placedAt:
                null,
              items: {
                create:
                  lines.map(
                    (
                      line,
                    ) => ({
                      variantId:
                        line.merchandiseId,
                      title:
                        line.title,
                      variantTitle:
                        line.variantTitle,
                      sku:
                        line.sku,
                      quantity:
                        line.quantity,
                      unitPriceMinor:
                        line.unitPriceMinor,
                      lineTotalMinor:
                        line.lineTotalMinor,
                    }),
                  ),
              },
            },
            update: {},
            select:
              orderSelect,
          });

      const snapshot =
        publicOrder(
          order,
          input.paymentProvider,
          input.paymentEnvironment,
        );

      if (
        reservationLines.length >
        0
      ) {
        const inserted =
          await tx
            .commerceInventoryReservation
            .createMany({
              data:
                reservationLines.map(
                  (
                    line,
                  ) => ({
                    orderId:
                      order.id,
                    inventoryItemId:
                      line.inventoryItemId,
                    quantity:
                      line.quantity,
                    status:
                      "reserved",
                    expiresAt:
                      snapshot.checkoutExpiresAt,
                  }),
                ),
              skipDuplicates:
                true,
            });

        if (
          inserted.count !==
            0 &&
          inserted.count !==
            reservationLines.length
        ) {
          throw new NativeCommerceCheckoutError(
            "COMMERCE_CHECKOUT_STATE_CONFLICT",
            "Checkout inventory reservation state is inconsistent.",
            409,
          );
        }

        if (
          inserted.count ===
          reservationLines.length
        ) {
          for (
            const line of
            reservationLines
          ) {
            const held =
              await tx
                .commerceInventoryItem
                .updateMany({
                  where: {
                    id:
                      line.inventoryItemId,
                    trackQuantity:
                      true,
                    quantity:
                      line.expectedQuantity,
                    reservedQuantity:
                      line.expectedReservedQuantity,
                  },
                  data: {
                    reservedQuantity: {
                      increment:
                        line.quantity,
                    },
                  },
                });

            if (
              held.count !==
              1
            ) {
              throw new NativeCommerceCheckoutError(
                "COMMERCE_INVENTORY_UNAVAILABLE",
                "Inventory changed while checkout was reserving the cart.",
                409,
              );
            }
          }
        }
      }

      const frozen =
        await tx
          .commerceCart
          .updateMany({
            where: {
              id:
                cart.id,
              status:
                "active",
            },
            data: {
              status:
                "converted",
              expiresAt:
                snapshot.checkoutExpiresAt,
            },
          });

      if (
        frozen.count !==
        1
      ) {
        const latest =
          await tx
            .commerceCart
            .findUnique({
              where: {
                id:
                  cart.id,
              },
              select: {
                status:
                  true,
                expiresAt:
                  true,
              },
            });

        if (
          latest?.status !==
            "converted" ||
          latest.expiresAt
            ?.getTime() !==
            snapshot.checkoutExpiresAt
              .getTime()
        ) {
          throw new NativeCommerceCheckoutError(
            "COMMERCE_CART_NOT_ACTIVE",
            "Cart is no longer active.",
            409,
          );
        }
      }

      return snapshot;
    },
  );
}

async function preparePaymentProvider(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId: string;
      surface:
        CommerceRuntimeSurface;
    }>,
) {
  try {
    return await prepareCommercePaymentCheckout(
      client,
      input,
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        CommerceProviderResolutionError
    ) {
      if (
        error.code ===
          "COMMERCE_PROVIDER_ROUTE_NOT_FOUND" ||
        error.code ===
          "COMMERCE_PROVIDER_CONNECTION_INVALID"
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_PAYMENT_PROVIDER_REQUIRED",
          "Choose and connect a payment provider before checkout.",
          409,
        );
      }

      if (
        error.code ===
          "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE"
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_PAYMENT_EXECUTION_UNAVAILABLE",
          "The selected payment provider is not available for checkout yet.",
          503,
        );
      }
    }

    throw error;
  }
}

export async function beginNativeCommerceCheckout(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId: string;
      surface:
        CommerceRuntimeSurface;
      request:
        CommerceCheckoutRequest;
    }>,
): Promise<
  CommerceCheckoutResult
> {
  const buildProjectId =
    projectId(
      input.buildProjectId,
    );

  const orderOwner =
    await resolveCommerceProvider(
      client,
      {
        buildProjectId,
        surface:
          input.surface,
        capability:
          "orders",
      },
    );

  if (
    orderOwner.provider !==
      ZOESTORE_COMMERCE_PROVIDER
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_ORDER_EXECUTION_UNAVAILABLE",
      "Zoé Store checkout requires an order provider compatible with Zoé Store.",
      503,
    );
  }

  const payment =
    await preparePaymentProvider(
      client,
      {
        buildProjectId,
        surface:
          input.surface,
      },
    );

  const order =
    await createOrReuseOrderSnapshot(
      client,
      {
        buildProjectId,
        surface:
          input.surface,
        cartToken:
          input.request.cartId,
        paymentProvider:
          payment.provider,
        paymentEnvironment:
          payment.environment,
      },
    );

  /*
   * Re-entering checkout for the same non-expired trusted order deliberately
   * replays this exact provider request with order.id as the idempotency key.
   * For a remote provider this can recover a payment session that may have
   * been created remotely before the local provider reference was persisted.
   * publicOrder() bounds
   * this recovery path to the trusted checkout reservation lifetime.
   */
  const started =
    await payment.begin({
      order,
      idempotencyKey:
        order.id,
    });

  const url =
    checkoutUrl(
      started.url,
    );

  const providerRef =
    providerReference(
      started.providerRef,
    );

  try {
    await adoptCommercePaymentProviderRef(
      client,
      {
        buildProjectId,
        orderId:
          order.id,
        provider:
          payment.provider,
        environment:
          payment.environment,
        providerRef,
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      CommercePaymentProviderRefError
    ) {
      throw new NativeCommerceCheckoutError(
        "COMMERCE_CHECKOUT_STATE_CONFLICT",
        "Checkout state changed while the payment session was being created.",
        409,
      );
    }

    throw error;
  }

  return {
    kind: "order",
    orderId:
      order.id,
    provider:
      payment.provider,
    url,
  };
}
