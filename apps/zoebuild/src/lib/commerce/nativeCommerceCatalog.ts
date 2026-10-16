import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

export type NativeCommerceCatalogSurface =
  | "preview"
  | "published";

export type NativeCommerceVariant = Readonly<{
  id: string;
  title: string;
  sku: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  availableForSale: boolean;
}>;

export type NativeCommerceProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  currency: string;
  defaultMerchandiseId: string | null;
  variants: readonly NativeCommerceVariant[];
}>;

export class NativeCommerceCatalogInputError extends Error {
  constructor(
    message: string,
  ) {
    super(message);
    this.name =
      "NativeCommerceCatalogInputError";
  }
}

function normalizedProjectId(
  value: string,
) {
  const projectId =
    value.trim();

  if (!projectId) {
    throw new NativeCommerceCatalogInputError(
      "A BuildProject id is required.",
    );
  }

  return projectId;
}

function normalizedFirst(
  value:
    | string
    | null
    | undefined,
) {
  if (
    value == null ||
    value.trim() === ""
  ) {
    return 24;
  }

  if (
    !/^\d+$/.test(
      value,
    )
  ) {
    throw new NativeCommerceCatalogInputError(
      "Catalog first must be an integer.",
    );
  }

  const first =
    Number(value);

  if (
    !Number.isSafeInteger(first) ||
    first < 1 ||
    first > 100
  ) {
    throw new NativeCommerceCatalogInputError(
      "Catalog first must be between 1 and 100.",
    );
  }

  return first;
}

function variantAvailable(
  row: {
    availableForSale:
      boolean;
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
  },
) {
  if (
    !row.availableForSale
  ) {
    return false;
  }

  if (
    !row.inventory ||
    !row.inventory.trackQuantity
  ) {
    return true;
  }

  return (
    row.inventory.quantity -
    row.inventory.reservedQuantity
  ) > 0;
}

function mapProduct(
  row: {
    id: string;
    slug: string;
    title: string;
    description:
      string | null;
    imageUrl:
      string | null;
    imageAltText:
      string | null;
    store: {
      defaultCurrency:
        string;
    };
    variants:
      Array<{
        id: string;
        title: string;
        sku:
          string | null;
        priceMinor:
          number;
        compareAtPriceMinor:
          number | null;
        availableForSale:
          boolean;
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
      }>;
  },
): NativeCommerceProduct {
  const variants =
    row.variants.map(
      (variant) => ({
        id:
          variant.id,
        title:
          variant.title,
        sku:
          variant.sku,
        priceMinor:
          variant.priceMinor,
        compareAtPriceMinor:
          variant.compareAtPriceMinor,
        availableForSale:
          variantAvailable(
            variant,
          ),
      }),
    );

  return {
    id:
      row.id,
    slug:
      row.slug,
    title:
      row.title,
    description:
      row.description,
    imageUrl:
      row.imageUrl,
    imageAltText:
      row.imageAltText,
    currency:
      row.store.defaultCurrency,
    defaultMerchandiseId:
      variants.find(
        (variant) =>
          variant.availableForSale,
      )?.id ??
      null,
    variants,
  };
}

function storeStatusFilter(
  surface:
    NativeCommerceCatalogSurface,
) {
  return surface ===
    "published"
    ? ["active"] as const
    : [
        "draft",
        "active",
      ] as const;
}

const productSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  imageUrl: true,
  imageAltText: true,
  store: {
    select: {
      defaultCurrency:
        true,
    },
  },
  variants: {
    orderBy: [
      {
        position:
          "asc" as const,
      },
      {
        id:
          "asc" as const,
      },
    ] as [
      {
        position:
          "asc";
      },
      {
        id:
          "asc";
      },
    ],
    select: {
      id: true,
      title: true,
      sku: true,
      priceMinor: true,
      compareAtPriceMinor:
        true,
      availableForSale:
        true,
      inventory: {
        select: {
          quantity: true,
          reservedQuantity:
            true,
          trackQuantity:
            true,
        },
      },
    },
  },
} as const;

export async function listNativeCommerceProducts(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCatalogSurface;
      first?:
        string |
        null;
    }>,
): Promise<
  readonly NativeCommerceProduct[]
> {
  const buildProjectId =
    normalizedProjectId(
      input.buildProjectId,
    );

  const first =
    normalizedFirst(
      input.first,
    );

  const rows =
    await client
      .commerceProduct
      .findMany({
        where: {
          status:
            "active",
          store: {
            buildProjectId,
            status: {
              in: [
                ...storeStatusFilter(
                  input.surface,
                ),
              ],
            },
          },
        },
        orderBy: [
          {
            updatedAt:
              "desc",
          },
          {
            id:
              "asc",
          },
        ],
        take:
          first,
        select:
          productSelect,
      });

  return rows.map(
    mapProduct,
  );
}

export async function getNativeCommerceProduct(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      surface:
        NativeCommerceCatalogSurface;
      id?:
        string |
        null;
      slug?:
        string |
        null;
    }>,
): Promise<
  NativeCommerceProduct |
  null
> {
  const buildProjectId =
    normalizedProjectId(
      input.buildProjectId,
    );

  const id =
    input.id?.trim() ||
    null;

  const slug =
    input.slug?.trim() ||
    null;

  if (
    Boolean(id) ===
    Boolean(slug)
  ) {
    throw new NativeCommerceCatalogInputError(
      "Catalog get requires exactly one product id or slug.",
    );
  }

  const row =
    await client
      .commerceProduct
      .findFirst({
        where: {
          status:
            "active",
          ...(id
            ? {
                id,
              }
            : {
                slug:
                  slug!,
              }),
          store: {
            buildProjectId,
            status: {
              in: [
                ...storeStatusFilter(
                  input.surface,
                ),
              ],
            },
          },
        },
        select:
          productSelect,
      });

  return row
    ? mapProduct(
        row,
      )
    : null;
}
