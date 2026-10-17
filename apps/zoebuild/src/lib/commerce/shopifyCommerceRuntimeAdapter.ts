import "server-only";

import { isIP } from "node:net";
import type { PrismaClient } from "@zoeskoul/db";
import { resolveCommerceProviderEnvironment } from "./nativeCommerceProvider";
import type {
  CommerceCart,
  CommerceCartRuntimeInput,
  CommerceCatalogGetInput,
  CommerceCatalogListInput,
  CommerceCatalogProduct,
} from "./commerceRuntimeContracts";
import type { CommerceProviderExecutionContext } from "./commerceRuntimeRegistry";
import { createShopifyOpaqueCartBridge, type ShopifyOpaqueCartSnapshot } from "./shopifyOpaqueCartBridge";
import { createShopifyStorefrontCart } from "./shopifyStorefrontCart";
import { createShopifyStorefrontCatalog } from "./shopifyStorefrontCatalog";
import { resolveShopifyStorefrontGraphqlConnection } from "./shopifyStorefrontCredentialVault";
import { positiveInt, shopifyGid } from "./shopifyStorefrontDomain";

const SHOP_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;

/** Generic failure: neither tokens nor a shop's secret-bearing cart ID can escape. */
export class ShopifyCommerceRuntimeAdapterError extends Error {
  readonly code = "SHOPIFY_COMMERCE_RUNTIME_UNAVAILABLE" as const;
  constructor() {
    super("Shopify commerce capability is unavailable for this project and environment.");
    this.name = "ShopifyCommerceRuntimeAdapterError";
  }
}

function reject(): never {
  throw new ShopifyCommerceRuntimeAdapterError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type Execution = CommerceProviderExecutionContext;

/**
 * Reverify the provider-neutral persisted context and derive the canonical shop
 * from the encrypted Admin identity, *not* from a request body, environment
 * variable or public config. The separate Storefront vault resolver rechecks
 * this exact shop, status, project and environment before releasing a GraphQL port.
 */
async function ports(client: PrismaClient, context: Execution, surface: "preview" | "published") {
  if (!context || context.provider !== "shopify" ||
      (context.environment !== "test" && context.environment !== "live") ||
      !context.buildProjectId?.trim() || !context.secretStore ||
      !context.connection?.id || !context.connection.credentialsSecretRef) reject();

  const store = await client.commerceStore.findUnique({
    where: { buildProjectId: context.buildProjectId }, select: { id: true, status: true },
  });
  if (!store || (surface === "published" ? store.status !== "active" :
      (store.status !== "active" && store.status !== "draft"))) reject();

  const connection = await client.commerceProviderConnection.findUnique({
    where: {
      storeId_provider_environment: {
        storeId: store.id, provider: "shopify", environment: context.environment,
      },
    },
    select: {
      id: true, status: true, credentialsSecretRef: true, storefrontSecretRef: true,
    },
  });
  if (!connection || connection.status !== "active" ||
      connection.id !== context.connection.id ||
      connection.credentialsSecretRef !== context.connection.credentialsSecretRef ||
      !connection.storefrontSecretRef) reject();

  const admin: unknown = await context.secretStore.read({
    buildProjectId: context.buildProjectId,
    secretRef: connection.credentialsSecretRef!,
  });
  if (!isRecord(admin) || admin.version !== 1 || admin.kind !== "shopify-offline-oauth" ||
      admin.buildProjectId !== context.buildProjectId || admin.storeId !== store.id ||
      admin.environment !== context.environment ||
      typeof admin.shopHostname !== "string" || !SHOP_HOST.test(admin.shopHostname) ||
      typeof admin.refreshTokenExpiresAt !== "string" ||
      !(Date.parse(admin.refreshTokenExpiresAt) > Date.now())) reject();

  const graphql = await resolveShopifyStorefrontGraphqlConnection(client, {
    buildProjectId: context.buildProjectId,
    storeId: store.id,
    environment: context.environment,
    shopHostname: admin.shopHostname,
    secretStore: context.secretStore,
  });
  return {
    catalog: createShopifyStorefrontCatalog(graphql),
    bridge: createShopifyOpaqueCartBridge(client, {
      buildProjectId: context.buildProjectId,
      environment: context.environment,
      secretStore: context.secretStore,
      cartPort: createShopifyStorefrontCart(graphql),
    }),
  };
}

function assertSurface(
  input: CommerceCatalogListInput | CommerceCatalogGetInput | CommerceCartRuntimeInput,
  context: Execution,
): void {
  if (input.buildProjectId !== context.buildProjectId ||
      resolveCommerceProviderEnvironment(input.surface) !== context.environment) reject();
}

/** An unregistered capability adapter; safe to prepare before migrations deploy. */
export async function listShopifyCommerceProducts(
  client: PrismaClient,
  input: CommerceCatalogListInput,
  context: Execution,
): Promise<readonly CommerceCatalogProduct[]> {
  assertSurface(input, context);
  return (await ports(client, context, input.surface)).catalog.listProducts(input.first);
}

export async function getShopifyCommerceProduct(
  client: PrismaClient,
  input: CommerceCatalogGetInput,
  context: Execution,
): Promise<CommerceCatalogProduct | null> {
  assertSurface(input, context);
  return (await ports(client, context, input.surface)).catalog.getProduct({ id: input.id, slug: input.slug });
}

function commerceCart(snapshot: ShopifyOpaqueCartSnapshot): CommerceCart {
  return {
    id: snapshot.cartToken,
    currency: snapshot.currency,
    totalQuantity: snapshot.totalQuantity,
    subtotalMinor: snapshot.subtotalMinor,
    items: snapshot.items.map((item) => ({
      merchandiseId: item.merchandiseId,
      quantity: item.quantity,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };
}

/**
 * NOT a registered CartHandler yet. Buyer IP is mandatory and must be produced
 * by trusted HTTP ingress (never from a generated site or JSON command).
 * The current provider-neutral CartHandler signature has no request IP field;
 * do not register Shopify until that transport boundary is completed.
 */
export async function executeShopifyCommerceCartCommand(
  client: PrismaClient,
  input: CommerceCartRuntimeInput,
  context: Execution,
  trusted: Readonly<{ buyerIp: string }>,
): Promise<CommerceCart> {
  assertSurface(input, context);
  if (!trusted || typeof trusted.buyerIp !== "string" || isIP(trusted.buyerIp) === 0) reject();
  const bridge = (await ports(client, context, input.surface)).bridge;
  const command = input.command;
  let snapshot: ShopifyOpaqueCartSnapshot;
  switch (command.operation) {
    case "get":
      snapshot = await bridge.read({ cartToken: command.cartId, buyerIp: trusted.buyerIp });
      break;
    case "add": {
      const merchandiseId = shopifyGid(command.merchandiseId, "ProductVariant");
      const quantity = positiveInt(command.quantity);
      snapshot = command.cartId == null
        ? await bridge.create({ merchandiseId, quantity, buyerIp: trusted.buyerIp })
        : await bridge.add({ cartToken: command.cartId, merchandiseId, quantity, buyerIp: trusted.buyerIp });
      break;
    }
    case "update":
      snapshot = await bridge.update({
        cartToken: command.cartId,
        merchandiseId: shopifyGid(command.merchandiseId, "ProductVariant"),
        quantity: positiveInt(command.quantity),
        buyerIp: trusted.buyerIp,
      });
      break;
    case "remove":
      snapshot = await bridge.remove({
        cartToken: command.cartId,
        merchandiseId: shopifyGid(command.merchandiseId, "ProductVariant"),
        buyerIp: trusted.buyerIp,
      });
      break;
    default:
      return reject();
  }
  return commerceCart(snapshot);
}
