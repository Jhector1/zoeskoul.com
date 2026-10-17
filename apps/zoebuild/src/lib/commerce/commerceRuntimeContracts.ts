import "server-only";

/**
 * Provider-neutral server runtime shapes.
 *
 * These contracts describe the trusted ZoeBuild commerce facade. Provider
 * adapters may use different remote identifiers internally, but must map them
 * into these shapes before they cross the runtime boundary.
 */

export type CommerceRuntimeSurface =
  | "preview"
  | "published";

export type CommerceCatalogVariant = Readonly<{
  id: string;
  title: string;
  sku: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  availableForSale: boolean;
}>;

export type CommerceCatalogProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  currency: string;
  defaultMerchandiseId: string | null;
  variants: readonly CommerceCatalogVariant[];
}>;

export type CommerceCatalogListInput = Readonly<{
  buildProjectId: string;
  surface: CommerceRuntimeSurface;
  first?: string | null;
}>;

export type CommerceCatalogGetInput = Readonly<{
  buildProjectId: string;
  surface: CommerceRuntimeSurface;
  id?: string | null;
  slug?: string | null;
}>;

export type CommerceCartItem = Readonly<{
  merchandiseId: string;
  quantity: number;
  title: string;
  variantTitle: string;
  sku: string | null;
  unitPriceMinor: number;
  lineTotalMinor: number;
}>;

export type CommerceCart = Readonly<{
  id: string;
  currency: string;
  totalQuantity: number;
  subtotalMinor: number;
  items: readonly CommerceCartItem[];
}>;

export type CommerceCartCommand =
  | Readonly<{
      operation: "get";
      cartId: unknown;
    }>
  | Readonly<{
      operation: "add";
      cartId?: unknown;
      merchandiseId: unknown;
      quantity: unknown;
    }>
  | Readonly<{
      operation: "update";
      cartId: unknown;
      merchandiseId: unknown;
      quantity: unknown;
    }>
  | Readonly<{
      operation: "remove";
      cartId: unknown;
      merchandiseId: unknown;
    }>;

export type CommerceCartRuntimeInput = Readonly<{
  buildProjectId: string;
  surface: CommerceRuntimeSurface;
  command: CommerceCartCommand;
}>;

export type CommerceCheckoutRequest = Readonly<{
  cartId: string;
}>;

export type CommerceCheckoutResult = Readonly<{
  orderId: string;
  provider: string;
  url: string;
}>;

export type CommerceCheckoutRuntimeInput = Readonly<{
  buildProjectId: string;
  surface: CommerceRuntimeSurface;
  request: CommerceCheckoutRequest;
}>;

export type TrustedCommerceOrderLine = Readonly<{
  merchandiseId: string;
  title: string;
  variantTitle: string;
  sku: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}>;

export type TrustedCommerceOrderSnapshot = Readonly<{
  id: string;
  cartId: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  paymentProvider: string;
  paymentEnvironment: "test" | "live";
  paymentProviderRef: string | null;
  checkoutExpiresAt: Date;
  items: readonly TrustedCommerceOrderLine[];
}>;
