import "server-only";

import type { CommerceCatalogProduct } from "./commerceRuntimeContracts";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";
import {
  array, currency, failDomain, moneyMinor, object, optionalString,
  positiveInt, shopifyGid, string,
} from "./shopifyStorefrontDomain";

type Graphql = Pick<ReturnType<typeof createShopifyStorefrontGraphql>, "execute">;
const MAX_VARIANTS = 100;
const FIELDS = `id handle title description featuredImage { url altText }
  variants(first: ${MAX_VARIANTS}) {
    nodes { id title sku availableForSale price { amount currencyCode }
      compareAtPrice { amount currencyCode } }
    pageInfo { hasNextPage }
  }`;
const LIST = `query ZoeShopifyProducts($first: Int!) { products(first: $first) { nodes { ${FIELDS} } } }`;
const BY_ID = `query ZoeShopifyProductById($id: ID!) { product(id: $id) { ${FIELDS} } }`;
const BY_HANDLE = `query ZoeShopifyProductByHandle($handle: String!) { product(handle: $handle) { ${FIELDS} } }`;

function product(value: unknown): CommerceCatalogProduct {
  const data = object(value);
  const id = shopifyGid(data.id, "Product");
  const slug = string(data.handle, 256);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) failDomain();
  const variants = object(data.variants);
  if (object(variants.pageInfo).hasNextPage !== false) failDomain();
  const nodes = array(variants.nodes, MAX_VARIANTS);
  if (nodes.length === 0) failDomain();
  let currencyCode: string | null = null;
  const mapped = nodes.map((node) => {
    const variant = object(node);
    const price = moneyMinor(variant.price, currencyCode ?? undefined);
    currencyCode = price.currency;
    const compare = variant.compareAtPrice === null || variant.compareAtPrice === undefined
      ? null : moneyMinor(variant.compareAtPrice, currencyCode).minor;
    if (typeof variant.availableForSale !== "boolean") failDomain();
    return {
      id: shopifyGid(variant.id, "ProductVariant"),
      title: string(variant.title, 512),
      sku: optionalString(variant.sku, 256),
      priceMinor: price.minor,
      compareAtPriceMinor: compare,
      availableForSale: variant.availableForSale,
    };
  });
  const image = data.featuredImage == null ? null : object(data.featuredImage);
  const imageUrl = image ? string(image.url, 2048) : null;
  if (imageUrl) {
    let parsed: URL;
    try { parsed = new URL(imageUrl); } catch { return failDomain(); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) failDomain();
  }
  return {
    id, slug,
    title: string(data.title, 512),
    description: optionalString(data.description, 4096),
    imageUrl,
    imageAltText: image ? optionalString(image.altText, 512) : null,
    currency: currency(currencyCode),
    defaultMerchandiseId: mapped.find((v) => v.availableForSale)?.id ?? mapped[0]!.id,
    variants: mapped,
  };
}

/** Typed, server-only catalog translation. No credential selection or provider registration. */
export function createShopifyStorefrontCatalog(graphql: Graphql) {
  return {
    async listProducts(firstInput?: string | null): Promise<readonly CommerceCatalogProduct[]> {
      const first = firstInput == null ? 20 : positiveInt(Number(firstInput), 25);
      if (firstInput != null && !/^[1-9]\d?$/.test(firstInput)) failDomain();
      const data = await graphql.execute<Record<string, unknown>>({
        document: LIST, variables: { first }, audience: { kind: "system" },
      });
      const products = object(data.products);
      return array(products.nodes, 25).map(product);
    },
    async getProduct(input: Readonly<{id?: string | null; slug?: string | null}>): Promise<CommerceCatalogProduct | null> {
      const hasId = typeof input.id === "string" && input.id.length > 0;
      const hasSlug = typeof input.slug === "string" && input.slug.length > 0;
      if (hasId === hasSlug) failDomain();
      const id = hasId ? shopifyGid(input.id, "Product") : null;
      const handle = hasSlug ? string(input.slug, 256) : null;
      if (handle && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) failDomain();
      const data = await graphql.execute<Record<string, unknown>>({
        document: id ? BY_ID : BY_HANDLE,
        variables: id ? { id } : { handle },
        audience: { kind: "system" },
      });
      return data.product == null ? null : product(data.product);
    },
  };
}
