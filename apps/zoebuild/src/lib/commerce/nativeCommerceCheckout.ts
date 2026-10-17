import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  createBuildSecretStore,
  type BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  STRIPE_COMMERCE_CHECKOUT_EXECUTOR,
} from "./stripeCommerceCheckout";

import {
  hashNativeCommerceCartToken,
  NativeCommerceCartError,
  parseNativeCommerceCartToken,
} from "./nativeCommerceCart";

import {
  CommerceProviderResolutionError,
  ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
  requireCommerceProviderAdapter,
  resolveCommerceProvider,
  type CommerceProviderConnectionSnapshot,
} from "./commerceProviderResolver";

import type {
  CommerceProviderEnvironment,
  CommerceStorefrontSurface,
} from "./nativeCommerceProvider";

export type CommerceCheckoutRequest =
  Readonly<{
    cartId: string;
  }>;

export type CommerceCheckoutResult =
  Readonly<{
    orderId: string;
    provider: string;
    url: string;
  }>;

export type TrustedCommerceOrderLine =
  Readonly<{
    merchandiseId: string;
    title: string;
    variantTitle: string;
    sku: string | null;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;

export type TrustedCommerceOrderSnapshot =
  Readonly<{
    id: string;
    cartId: string;
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    shippingMinor: number;
    totalMinor: number;
    paymentProvider: string;
    paymentProviderRef: string | null;
    items:
      readonly TrustedCommerceOrderLine[];
  }>;

export type CommercePaymentCheckoutExecutor =
  Readonly<{
    provider: string;
    requiresSecretStore?:
      boolean;
    preflight?(
      input:
        Readonly<{
          buildProjectId:
            string;
          environment:
            CommerceProviderEnvironment;
          connection:
            CommerceProviderConnectionSnapshot;
          secretStore:
            BuildSecretStore;
        }>,
    ):
      Promise<void>;
    begin(
      input:
        Readonly<{
          environment:
            CommerceProviderEnvironment;
          connection:
            CommerceProviderConnectionSnapshot;
          order:
            TrustedCommerceOrderSnapshot;
          idempotencyKey:
            string;
          buildProjectId?:
            string;
          secretStore?:
            BuildSecretStore;
        }>,
    ):
      Promise<
        Readonly<{
          url: string;
          providerRef: string;
        }>
      >;
  }>;

export type CommercePaymentCheckoutRegistry =
  ReadonlyMap<
    string,
    CommercePaymentCheckoutExecutor
  >;

export const COMMERCE_PAYMENT_CHECKOUT_EXECUTORS:
  CommercePaymentCheckoutRegistry =
    new Map([
      [
        STRIPE_COMMERCE_CHECKOUT_EXECUTOR.provider,
        STRIPE_COMMERCE_CHECKOUT_EXECUTOR,
      ],
    ]);

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
    CommerceStorefrontSurface,
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
      currency: string;
      subtotalMinor: number;
      discountMinor: number;
      taxMinor: number;
      shippingMinor: number;
      totalMinor: number;
      paymentProvider: string | null;
      paymentProviderRef: string | null;
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
): TrustedCommerceOrderSnapshot {
  if (
    !order.cartId ||
    order.paymentProvider !==
      expectedProvider
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_ALREADY_STARTED",
      "Checkout has already started with another payment provider.",
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
    paymentProviderRef:
      order.paymentProviderRef,
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
  paymentProviderRef:
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
        CommerceStorefrontSurface;
      cartToken: string;
      paymentProvider: string;
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
              paymentProviderRef:
                null,
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

      if (
        order.paymentProvider !==
          input.paymentProvider
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_CHECKOUT_ALREADY_STARTED",
          "Checkout has already started with another payment provider.",
          409,
        );
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
            },
          });

      if (
        frozen.count !==
          1
      ) {
        throw new NativeCommerceCheckoutError(
          "COMMERCE_CART_NOT_ACTIVE",
          "Cart is no longer active.",
          409,
        );
      }

      return publicOrder(
        order,
        input.paymentProvider,
      );
    },
  );
}

function executorForProvider(
  registry:
    CommercePaymentCheckoutRegistry,
  provider:
    string,
) {
  const executor =
    registry.get(
      provider,
    );

  if (
    !executor ||
    executor.provider !==
      provider
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_PAYMENT_EXECUTION_UNAVAILABLE",
      "The selected payment provider is not available for checkout yet.",
      503,
    );
  }

  return executor;
}

async function resolvePaymentProvider(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId: string;
      surface:
        CommerceStorefrontSurface;
    }>,
) {
  try {
    return await resolveCommerceProvider(
      client,
      {
        ...input,
        capability:
          "payments",
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        CommerceProviderResolutionError &&
      (
        error.code ===
          "COMMERCE_PROVIDER_ROUTE_NOT_FOUND" ||
        error.code ===
          "COMMERCE_PROVIDER_CONNECTION_REQUIRED"
      )
    ) {
      throw new NativeCommerceCheckoutError(
        "COMMERCE_PAYMENT_PROVIDER_REQUIRED",
        "Choose and connect a payment provider before checkout.",
        409,
      );
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
        CommerceStorefrontSurface;
      request:
        CommerceCheckoutRequest;
    }>,
  executors:
    CommercePaymentCheckoutRegistry =
      COMMERCE_PAYMENT_CHECKOUT_EXECUTORS,
): Promise<
  CommerceCheckoutResult
> {
  const buildProjectId =
    projectId(
      input.buildProjectId,
    );

  const checkoutOwner =
    await resolveCommerceProvider(
      client,
      {
        buildProjectId,
        surface:
          input.surface,
        capability:
          "checkout",
      },
    );

  requireCommerceProviderAdapter(
    checkoutOwner,
    ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
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

  requireCommerceProviderAdapter(
    orderOwner,
    ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
  );

  const payment =
    await resolvePaymentProvider(
      client,
      {
        buildProjectId,
        surface:
          input.surface,
      },
    );

  if (!payment.connection) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_PAYMENT_PROVIDER_REQUIRED",
      "Choose and connect a payment provider before checkout.",
      409,
    );
  }

  const executor =
    executorForProvider(
      executors,
      payment.provider,
    );

  const secretStore =
    executor.requiresSecretStore
      ? createBuildSecretStore({
          prisma:
            client,
        })
      : undefined;

  if (
    executor.preflight
  ) {
    if (!secretStore) {
      throw new NativeCommerceCheckoutError(
        "COMMERCE_PAYMENT_SECRET_STORE_REQUIRED",
        "The selected payment provider requires secure server credentials.",
        503,
      );
    }

    await executor.preflight({
      buildProjectId,
      environment:
        payment.environment,
      connection:
        payment.connection,
      secretStore,
    });
  }

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
      },
    );

  const started =
    await executor.begin({
      environment:
        payment.environment,
      connection:
        payment.connection,
      order,
      idempotencyKey:
        order.id,
      buildProjectId,
      secretStore,
    });

  const url =
    checkoutUrl(
      started.url,
    );

  const providerRef =
    providerReference(
      started.providerRef,
    );

  const persisted =
    await client
      .commerceOrder
      .updateMany({
        where: {
          id:
            order.id,
          paymentProvider:
            payment.provider,
          OR: [
            {
              paymentProviderRef:
                null,
            },
            {
              paymentProviderRef:
                providerRef,
            },
          ],
        },
        data: {
          paymentProviderRef:
            providerRef,
        },
      });

  if (
    persisted.count !==
      1
  ) {
    throw new NativeCommerceCheckoutError(
      "COMMERCE_CHECKOUT_STATE_CONFLICT",
      "Checkout state changed while the payment session was being created.",
      409,
    );
  }

  return {
    orderId:
      order.id,
    provider:
      payment.provider,
    url,
  };
}
