import "server-only";

import type { CommerceCartItem } from "./commerceRuntimeContracts";
import { createShopifyStorefrontGraphql } from "./shopifyStorefrontGraphql";
import {
  array, failDomain, moneyMinor, nonNegativeInt, object,
  positiveInt, rejectUserErrors, remoteCartId, shopifyGid, string,
} from "./shopifyStorefrontDomain";

type Graphql = Pick<ReturnType<typeof createShopifyStorefrontGraphql>, "execute">;
const FIELDS = `id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } }
  lines(first: 100) { pageInfo { hasNextPage } nodes {
    id quantity merchandise { ... on ProductVariant { id title sku product { title } } }
    cost { amountPerQuantity { amount currencyCode } totalAmount { amount currencyCode } }
  } }`;
const READ = `query ZoeShopifyCart($cartId: ID!) { cart(id: $cartId) { ${FIELDS} } }`;
const CREATE = `mutation ZoeShopifyCartCreate($input: CartInput) { cartCreate(input: $input) {
  cart { ${FIELDS} } userErrors { field code } warnings { code }
} }`;
const ADD = `mutation ZoeShopifyCartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart { ${FIELDS} } userErrors { field code } warnings { code }
  }
}`;
const UPDATE = `mutation ZoeShopifyCartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart { ${FIELDS} } userErrors { field code } warnings { code }
  }
}`;
const REMOVE = `mutation ZoeShopifyCartLinesRemove($cartId: ID!, $lineIds: [ID!]) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart { ${FIELDS} } userErrors { field code } warnings { code }
  }
}`;

/** Trusted server-side snapshot. Never serialize remoteCartId or checkoutUrl to a public cart response. */
export type ShopifyRemoteCartSnapshot = Readonly<{
  remoteCartId: string;
  checkoutUrl: string;
  currency: string;
  totalQuantity: number;
  subtotalMinor: number;
  items: readonly CommerceCartItem[];
  internalLines: readonly Readonly<{id: string; merchandiseId: string}>[];
}>;

function cart(value: unknown, expectedId?: string): ShopifyRemoteCartSnapshot {
  const data = object(value);
  const id = remoteCartId(data.id);
  if (expectedId && id !== expectedId) failDomain();
  const totalQuantity = nonNegativeInt(data.totalQuantity);
  const subtotal = moneyMinor(object(data.cost).subtotalAmount);
  const lines = object(data.lines);
  if (object(lines.pageInfo).hasNextPage !== false) failDomain();
  const nodes = array(lines.nodes, 100);
  const internalLines: { id: string; merchandiseId: string }[] = [];
  const items: CommerceCartItem[] = nodes.map((node) => {
    const line = object(node);
    const merchandise = object(line.merchandise);
    const merchandiseId = shopifyGid(merchandise.id, "ProductVariant");
    const lineId = string(line.id, 512);
    if (!/^gid:\/\/shopify\/(?:CartLine|BaseCartLine)\/[A-Za-z0-9_-]+$/.test(lineId)) failDomain();
    const quantity = positiveInt(line.quantity, 1000);
    const cost = object(line.cost);
    const unit = moneyMinor(cost.amountPerQuantity, subtotal.currency);
    const total = moneyMinor(cost.totalAmount, subtotal.currency);
    const product = object(merchandise.product);
    internalLines.push({ id: lineId, merchandiseId });
    return {
      merchandiseId,
      quantity,
      title: string(product.title, 512),
      variantTitle: string(merchandise.title, 512),
      sku: merchandise.sku == null ? null : string(merchandise.sku, 256),
      unitPriceMinor: unit.minor,
      lineTotalMinor: total.minor,
    };
  });
  if (items.reduce((acc, item) => acc + item.quantity, 0) !== totalQuantity) failDomain();
  const checkoutUrl = string(data.checkoutUrl, 4096);
  let parsed: URL;
  try { parsed = new URL(checkoutUrl); } catch { return failDomain(); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) failDomain();
  return {
    remoteCartId: id,
    checkoutUrl,
    currency: subtotal.currency,
    totalQuantity,
    subtotalMinor: subtotal.minor,
    items,
    internalLines,
  };
}

function mutationResult(data: Record<string, unknown>, field: string, cartId?: string) {
  const payload = object(data[field]);
  rejectUserErrors(payload);
  return cart(payload.cart, cartId);
}

function matchingLine(snapshot: ShopifyRemoteCartSnapshot, merchandiseId: string): string {
  const matches = snapshot.internalLines.filter((line) => line.merchandiseId === merchandiseId);
  // Multiple lines of the same variant can differ in selling plan/attributes.
  // A merchandise-id-only command is ambiguous in this case.
  if (matches.length !== 1) failDomain("SHOPIFY_STOREFRONT_OPERATION_REJECTED");
  return matches[0]!.id;
}

/**
 * Raw Shopify cart identifiers are exclusively internal. The caller binds an
 * opaque customer token via externalCommerceCartHandle before/after these calls.
 * Browser IP is supplied by a trusted request-context resolver, never a JSON body.
 */
export function createShopifyStorefrontCart(graphql: Graphql) {
  return {
    async getCart(input: Readonly<{remoteCartId: string; buyerIp: string}>) {
      const cartId = remoteCartId(input.remoteCartId);
      const data = await graphql.execute<Record<string, unknown>>({
        document: READ, variables: { cartId }, audience: { kind: "buyer", ip: input.buyerIp },
      });
      if (data.cart == null) failDomain("SHOPIFY_STOREFRONT_OPERATION_REJECTED");
      return cart(data.cart, cartId);
    },
    async createCart(input: Readonly<{merchandiseId: string; quantity: number; buyerIp: string}>) {
      const merchandiseId = shopifyGid(input.merchandiseId, "ProductVariant");
      const quantity = positiveInt(input.quantity);
      const data = await graphql.execute<Record<string, unknown>>({
        document: CREATE,
        variables: { input: { lines: [{ merchandiseId, quantity }] } },
        audience: { kind: "buyer", ip: input.buyerIp },
      });
      return mutationResult(data, "cartCreate");
    },
    async addLine(input: Readonly<{remoteCartId: string; merchandiseId: string; quantity: number; buyerIp: string}>) {
      const cartId = remoteCartId(input.remoteCartId);
      const merchandiseId = shopifyGid(input.merchandiseId, "ProductVariant");
      const quantity = positiveInt(input.quantity);
      const data = await graphql.execute<Record<string, unknown>>({
        document: ADD,
        variables: { cartId, lines: [{ merchandiseId, quantity }] },
        audience: { kind: "buyer", ip: input.buyerIp },
      });
      return mutationResult(data, "cartLinesAdd", cartId);
    },
    async updateLine(input: Readonly<{remoteCartId: string; merchandiseId: string; quantity: number; buyerIp: string}>) {
      const cartId = remoteCartId(input.remoteCartId);
      const merchandiseId = shopifyGid(input.merchandiseId, "ProductVariant");
      const quantity = positiveInt(input.quantity);
      const existing = await this.getCart({ remoteCartId: cartId, buyerIp: input.buyerIp });
      const id = matchingLine(existing, merchandiseId);
      const data = await graphql.execute<Record<string, unknown>>({
        document: UPDATE,
        variables: { cartId, lines: [{ id, quantity }] },
        audience: { kind: "buyer", ip: input.buyerIp },
      });
      return mutationResult(data, "cartLinesUpdate", cartId);
    },
    async removeLine(input: Readonly<{remoteCartId: string; merchandiseId: string; buyerIp: string}>) {
      const cartId = remoteCartId(input.remoteCartId);
      const merchandiseId = shopifyGid(input.merchandiseId, "ProductVariant");
      const existing = await this.getCart({ remoteCartId: cartId, buyerIp: input.buyerIp });
      const lineId = matchingLine(existing, merchandiseId);
      const data = await graphql.execute<Record<string, unknown>>({
        document: REMOVE,
        variables: { cartId, lineIds: [lineId] },
        audience: { kind: "buyer", ip: input.buyerIp },
      });
      return mutationResult(data, "cartLinesRemove", cartId);
    },
  };
}
