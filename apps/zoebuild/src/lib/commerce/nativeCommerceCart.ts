import "server-only";

import {
  createHash,
  randomBytes,
} from "node:crypto";

import type {
  PrismaClient,
} from "@zoeskoul/db";

export type NativeCommerceCartSurface =
  | "preview"
  | "published";

export type NativeCommerceCartItem = Readonly<{
  merchandiseId: string;
  quantity: number;
  title: string;
  variantTitle: string;
  sku: string | null;
  unitPriceMinor: number;
  lineTotalMinor: number;
}>;

export type NativeCommerceCart = Readonly<{
  id: string;
  currency: string;
  totalQuantity: number;
  subtotalMinor: number;
  items: readonly NativeCommerceCartItem[];
}>;

export class NativeCommerceCartError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(message);
    this.name =
      "NativeCommerceCartError";
    this.code =
      code;
    this.status =
      status;
  }
}

const TOKEN_BYTES =
  32;

const TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{43}$/;

const MAX_LINE_QUANTITY =
  99;

type CartRow = {
  id: string;
  currency: string;
  items: Array<{
    quantity: number;
    variant: {
      id: string;
      title: string;
      sku: string | null;
      priceMinor: number;
      product: {
        title: string;
      };
    };
  }>;
};

const cartSelect = {
  id: true,
  currency: true,
  items: {
    orderBy: [
      {
        createdAt:
          "asc" as const,
      },
      {
        id:
          "asc" as const,
      },
    ] as [
      {
        createdAt:
          "asc";
      },
      {
        id:
          "asc";
      },
    ],
    select: {
      quantity: true,
      variant: {
        select: {
          id: true,
          title: true,
          sku: true,
          priceMinor: true,
          product: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  },
} as const;

function projectId(
  value: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new NativeCommerceCartError(
      "COMMERCE_PROJECT_REQUIRED",
      "A BuildProject id is required.",
      400,
    );
  }

  return normalized;
}

function merchandiseId(
  value: unknown,
) {
  if (
    typeof value !==
    "string"
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_MERCHANDISE_INVALID",
      "A merchandise id is required.",
      400,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      191
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_MERCHANDISE_INVALID",
      "A valid merchandise id is required.",
      400,
    );
  }

  return normalized;
}

function quantity(
  value: unknown,
) {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    Number(value) < 1 ||
    Number(value) >
      MAX_LINE_QUANTITY
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_QUANTITY_INVALID",
      `Quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}.`,
      400,
    );
  }

  return Number(value);
}

function token(
  value: unknown,
) {
  if (
    typeof value !==
      "string" ||
    !TOKEN_PATTERN.test(
      value,
    )
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_CART_NOT_FOUND",
      "Cart not found.",
      404,
    );
  }

  return value;
}

export function parseNativeCommerceCartToken(
  value: unknown,
) {
  return token(
    value,
  );
}

function optionalToken(
  value: unknown,
) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }

  return token(
    value,
  );
}

function hashToken(
  value: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

export function hashNativeCommerceCartToken(
  value: string,
) {
  return hashToken(
    value,
  );
}

function newToken() {
  return randomBytes(
    TOKEN_BYTES,
  ).toString(
    "base64url",
  );
}

function allowedStoreStatus(
  surface:
    NativeCommerceCartSurface,
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

function publicCart(
  row: CartRow,
  cartToken: string,
): NativeCommerceCart {
  const items =
    row.items.map(
      (item) => ({
        merchandiseId:
          item.variant.id,
        quantity:
          item.quantity,
        title:
          item.variant.product.title,
        variantTitle:
          item.variant.title,
        sku:
          item.variant.sku,
        unitPriceMinor:
          item.variant.priceMinor,
        lineTotalMinor:
          item.variant.priceMinor *
          item.quantity,
      }),
    );

  return {
    // Existing generated storefronts call this field cart.id. It is the opaque
    // browser token, never the CommerceCart primary key.
    id:
      cartToken,
    currency:
      row.currency,
    totalQuantity:
      items.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.quantity,
        0,
      ),
    subtotalMinor:
      items.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.lineTotalMinor,
        0,
      ),
    items,
  };
}

async function resolveStore(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
    }>,
) {
  const store =
    await client
      .commerceStore
      .findUnique({
        where: {
          buildProjectId:
            projectId(
              input.buildProjectId,
            ),
        },
        select: {
          id: true,
          status: true,
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
    throw new NativeCommerceCartError(
      "COMMERCE_STORE_NOT_FOUND",
      "Store not found.",
      404,
    );
  }

  return store;
}

async function loadCart(
  client:
    PrismaClient,
  input:
    Readonly<{
      storeId:
        string;
      cartToken:
        string;
    }>,
) {
  return client
    .commerceCart
    .findFirst({
      where: {
        storeId:
          input.storeId,
        publicTokenHash:
          hashToken(
            input.cartToken,
          ),
        status:
          "active",
      },
      select:
        cartSelect,
    });
}

async function requireCart(
  client:
    PrismaClient,
  input:
    Readonly<{
      storeId:
        string;
      cartToken:
        string;
    }>,
) {
  const row =
    await loadCart(
      client,
      input,
    );

  if (!row) {
    throw new NativeCommerceCartError(
      "COMMERCE_CART_NOT_FOUND",
      "Cart not found.",
      404,
    );
  }

  return row;
}

function assertInventory(
  variant:
    | {
        inventory:
          | {
              quantity:
                number;
              reservedQuantity:
                number;
              trackQuantity:
                boolean;
            }
          | null;
      }
    | null,
  desiredQuantity:
    number,
) {
  if (!variant) {
    throw new NativeCommerceCartError(
      "COMMERCE_MERCHANDISE_NOT_FOUND",
      "Merchandise is unavailable.",
      404,
    );
  }

  if (
    !variant.inventory ||
    !variant.inventory.trackQuantity
  ) {
    return;
  }

  const available =
    Math.max(
      0,
      variant.inventory.quantity -
        variant.inventory.reservedQuantity,
    );

  if (
    desiredQuantity >
    available
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_INVENTORY_UNAVAILABLE",
      "Requested quantity is unavailable.",
      409,
    );
  }
}

export async function getNativeCommerceCart(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
      cartToken:
        unknown;
    }>,
): Promise<
  NativeCommerceCart
> {
  const store =
    await resolveStore(
      client,
      input,
    );

  const cartToken =
    token(
      input.cartToken,
    );

  const row =
    await requireCart(
      client,
      {
        storeId:
          store.id,
        cartToken,
      },
    );

  return publicCart(
    row as CartRow,
    cartToken,
  );
}

export async function addNativeCommerceCartItem(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
      cartToken?:
        unknown;
      merchandiseId:
        unknown;
      quantity:
        unknown;
    }>,
): Promise<
  NativeCommerceCart
> {
  const store =
    await resolveStore(
      client,
      input,
    );

  const requestedMerchandise =
    merchandiseId(
      input.merchandiseId,
    );

  const increment =
    quantity(
      input.quantity,
    );

  const suppliedToken =
    optionalToken(
      input.cartToken,
    );

  return client.$transaction(
    async (
      tx,
    ) => {
      let cartToken =
        suppliedToken;

      let cartRow =
        cartToken
          ? await tx
              .commerceCart
              .findFirst({
                where: {
                  storeId:
                    store.id,
                  publicTokenHash:
                    hashToken(
                      cartToken,
                    ),
                  status:
                    "active",
                },
                select: {
                  id: true,
                  currency:
                    true,
                },
              })
          : null;

      if (
        cartToken &&
        !cartRow
      ) {
        throw new NativeCommerceCartError(
          "COMMERCE_CART_NOT_FOUND",
          "Cart not found.",
          404,
        );
      }

      if (!cartRow) {
        cartToken =
          newToken();

        cartRow =
          await tx
            .commerceCart
            .create({
              data: {
                storeId:
                  store.id,
                publicTokenHash:
                  hashToken(
                    cartToken,
                  ),
                status:
                  "active",
                currency:
                  store.defaultCurrency,
              },
              select: {
                id: true,
                currency:
                  true,
              },
            });
      }

      const variant =
        await tx
          .commerceVariant
          .findFirst({
            where: {
              id:
                requestedMerchandise,
              availableForSale:
                true,
              product: {
                storeId:
                  store.id,
                status:
                  "active",
              },
            },
            select: {
              id: true,
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
          });

      const existing =
        await tx
          .commerceCartItem
          .findUnique({
            where: {
              cartId_variantId: {
                cartId:
                  cartRow.id,
                variantId:
                  requestedMerchandise,
              },
            },
            select: {
              quantity:
                true,
            },
          });

      const desiredQuantity =
        (existing?.quantity ??
          0) +
        increment;

      if (
        desiredQuantity >
        MAX_LINE_QUANTITY
      ) {
        throw new NativeCommerceCartError(
          "COMMERCE_QUANTITY_INVALID",
          `Quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}.`,
          400,
        );
      }

      assertInventory(
        variant,
        desiredQuantity,
      );

      await tx
        .commerceCartItem
        .upsert({
          where: {
            cartId_variantId: {
              cartId:
                cartRow.id,
              variantId:
                requestedMerchandise,
            },
          },
          create: {
            cartId:
              cartRow.id,
            variantId:
              requestedMerchandise,
            quantity:
              desiredQuantity,
          },
          update: {
            quantity:
              desiredQuantity,
          },
        });

      const result =
        await tx
          .commerceCart
          .findUnique({
            where: {
              id:
                cartRow.id,
            },
            select:
              cartSelect,
          });

      if (
        !result ||
        !cartToken
      ) {
        throw new Error(
          "Native Commerce cart mutation did not return its cart.",
        );
      }

      return publicCart(
        result as CartRow,
        cartToken,
      );
    },
  );
}

export async function updateNativeCommerceCartItem(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
      cartToken:
        unknown;
      merchandiseId:
        unknown;
      quantity:
        unknown;
    }>,
): Promise<
  NativeCommerceCart
> {
  const store =
    await resolveStore(
      client,
      input,
    );

  const cartToken =
    token(
      input.cartToken,
    );

  const requestedMerchandise =
    merchandiseId(
      input.merchandiseId,
    );

  const desiredQuantity =
    quantity(
      input.quantity,
    );

  return client.$transaction(
    async (
      tx,
    ) => {
      const cartRow =
        await tx
          .commerceCart
          .findFirst({
            where: {
              storeId:
                store.id,
              publicTokenHash:
                hashToken(
                  cartToken,
                ),
              status:
                "active",
            },
            select: {
              id: true,
            },
          });

      if (!cartRow) {
        throw new NativeCommerceCartError(
          "COMMERCE_CART_NOT_FOUND",
          "Cart not found.",
          404,
        );
      }

      const variant =
        await tx
          .commerceVariant
          .findFirst({
            where: {
              id:
                requestedMerchandise,
              availableForSale:
                true,
              product: {
                storeId:
                  store.id,
                status:
                  "active",
              },
            },
            select: {
              id: true,
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
          });

      assertInventory(
        variant,
        desiredQuantity,
      );

      const changed =
        await tx
          .commerceCartItem
          .updateMany({
            where: {
              cartId:
                cartRow.id,
              variantId:
                requestedMerchandise,
            },
            data: {
              quantity:
                desiredQuantity,
            },
          });

      if (
        changed.count !==
        1
      ) {
        throw new NativeCommerceCartError(
          "COMMERCE_CART_ITEM_NOT_FOUND",
          "Cart item not found.",
          404,
        );
      }

      const result =
        await tx
          .commerceCart
          .findUnique({
            where: {
              id:
                cartRow.id,
            },
            select:
              cartSelect,
          });

      if (!result) {
        throw new Error(
          "Native Commerce cart update lost its cart.",
        );
      }

      return publicCart(
        result as CartRow,
        cartToken,
      );
    },
  );
}

export async function removeNativeCommerceCartItem(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
      cartToken:
        unknown;
      merchandiseId:
        unknown;
    }>,
): Promise<
  NativeCommerceCart
> {
  const store =
    await resolveStore(
      client,
      input,
    );

  const cartToken =
    token(
      input.cartToken,
    );

  const requestedMerchandise =
    merchandiseId(
      input.merchandiseId,
    );

  return client.$transaction(
    async (
      tx,
    ) => {
      const cartRow =
        await tx
          .commerceCart
          .findFirst({
            where: {
              storeId:
                store.id,
              publicTokenHash:
                hashToken(
                  cartToken,
                ),
              status:
                "active",
            },
            select: {
              id: true,
            },
          });

      if (!cartRow) {
        throw new NativeCommerceCartError(
          "COMMERCE_CART_NOT_FOUND",
          "Cart not found.",
          404,
        );
      }

      await tx
        .commerceCartItem
        .deleteMany({
          where: {
            cartId:
              cartRow.id,
            variantId:
              requestedMerchandise,
          },
        });

      const result =
        await tx
          .commerceCart
          .findUnique({
            where: {
              id:
                cartRow.id,
            },
            select:
              cartSelect,
          });

      if (!result) {
        throw new Error(
          "Native Commerce cart removal lost its cart.",
        );
      }

      return publicCart(
        result as CartRow,
        cartToken,
      );
    },
  );
}

export type NativeCommerceCartCommand =
  | Readonly<{
      operation:
        "get";
      cartId:
        unknown;
    }>
  | Readonly<{
      operation:
        "add";
      cartId?:
        unknown;
      merchandiseId:
        unknown;
      quantity:
        unknown;
    }>
  | Readonly<{
      operation:
        "update";
      cartId:
        unknown;
      merchandiseId:
        unknown;
      quantity:
        unknown;
    }>
  | Readonly<{
      operation:
        "remove";
      cartId:
        unknown;
      merchandiseId:
        unknown;
    }>;

export function parseNativeCommerceCartCommand(
  value: unknown,
): NativeCommerceCartCommand {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new NativeCommerceCartError(
      "COMMERCE_REQUEST_INVALID",
      "Invalid commerce request.",
      400,
    );
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  switch (
    record.operation
  ) {
    case "get":
      return {
        operation:
          "get",
        cartId:
          record.cartId,
      };

    case "add":
      return {
        operation:
          "add",
        cartId:
          record.cartId,
        merchandiseId:
          record.merchandiseId,
        quantity:
          record.quantity,
      };

    case "update":
      return {
        operation:
          "update",
        cartId:
          record.cartId,
        merchandiseId:
          record.merchandiseId,
        quantity:
          record.quantity,
      };

    case "remove":
      return {
        operation:
          "remove",
        cartId:
          record.cartId,
        merchandiseId:
          record.merchandiseId,
      };

    default:
      throw new NativeCommerceCartError(
        "COMMERCE_OPERATION_INVALID",
        "Invalid cart operation.",
        400,
      );
  }
}

export async function executeNativeCommerceCartCommand(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCartSurface;
      command:
        NativeCommerceCartCommand;
    }>,
) {
  switch (
    input.command.operation
  ) {
    case "get":
      return getNativeCommerceCart(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          surface:
            input.surface,
          cartToken:
            input.command.cartId,
        },
      );

    case "add":
      return addNativeCommerceCartItem(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          surface:
            input.surface,
          cartToken:
            input.command.cartId,
          merchandiseId:
            input.command.merchandiseId,
          quantity:
            input.command.quantity,
        },
      );

    case "update":
      return updateNativeCommerceCartItem(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          surface:
            input.surface,
          cartToken:
            input.command.cartId,
          merchandiseId:
            input.command.merchandiseId,
          quantity:
            input.command.quantity,
        },
      );

    case "remove":
      return removeNativeCommerceCartItem(
        client,
        {
          buildProjectId:
            input.buildProjectId,
          surface:
            input.surface,
          cartToken:
            input.command.cartId,
          merchandiseId:
            input.command.merchandiseId,
        },
      );
  }
}
