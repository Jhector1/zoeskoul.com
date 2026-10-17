import "server-only";

import { isIP } from "node:net";
import type { PrismaClient } from "@zoeskoul/db";
import type { BuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import type { CommerceCartItem } from "./commerceRuntimeContracts";
import {
  createExternalCommerceCartHandle,
  resolveExternalCommerceCartHandle,
} from "./externalCommerceCartHandle";
import type { ShopifyRemoteCartSnapshot } from "./shopifyStorefrontCart";
import { createShopifyStorefrontCart } from "./shopifyStorefrontCart";

const PROVIDER = "shopify" as const;
type Environment = "test" | "live";
type CartPort = ReturnType<typeof createShopifyStorefrontCart>;

export type ShopifyOpaqueCartSnapshot = Readonly<{
  cartToken: string;
  currency: string;
  totalQuantity: number;
  subtotalMinor: number;
  items: readonly CommerceCartItem[];
}>;

export class ShopifyOpaqueCartBridgeError extends Error {
  readonly code = "SHOPIFY_OPAQUE_CART_SCOPE_INVALID" as const;
  constructor() {
    super("Shopify cart operation cannot be completed for this scope.");
    this.name = "ShopifyOpaqueCartBridgeError";
  }
}

function reject(): never { throw new ShopifyOpaqueCartBridgeError(); }

function publicSnapshot(
  cartToken: string,
  cart: ShopifyRemoteCartSnapshot,
  currency: string,
): ShopifyOpaqueCartSnapshot {
  // The public response is an explicit allowlist. Never spread a Shopify cart
  // object: remoteCartId contains ?key=secret and checkoutUrl is sensitive.
  if (cart.currency !== currency) reject();
  return {
    cartToken,
    currency,
    totalQuantity: cart.totalQuantity,
    subtotalMinor: cart.subtotalMinor,
    items: cart.items.map(({ merchandiseId, quantity, title, variantTitle, sku, unitPriceMinor, lineTotalMinor }) => ({
      merchandiseId, quantity, title, variantTitle, sku, unitPriceMinor, lineTotalMinor,
    })),
  };
}

/**
 * Server-only bridge over existing encrypted provider-neutral external cart
 * handles. Caller must inject an already authenticated, exact-environment
 * Shopify cart port. No route, provider registry or token selection here.
 */
export function createShopifyOpaqueCartBridge(
  client: PrismaClient,
  scope: Readonly<{
    buildProjectId: string;
    environment: Environment;
    secretStore: BuildSecretStore;
    cartPort: Pick<CartPort, "createCart" | "getCart" | "addLine" | "updateLine" | "removeLine">;
  }>,
) {
  if (!scope.buildProjectId?.trim() ||
      (scope.environment !== "test" && scope.environment !== "live") ||
      !scope.secretStore || !scope.cartPort) reject();

  function buyer(ip: string): string {
    // The IP must come from trusted server request context, not JSON body.
    if (typeof ip !== "string" || isIP(ip) === 0) reject();
    return ip;
  }

  async function existing(token: unknown) {
    return resolveExternalCommerceCartHandle(client, {
      buildProjectId: scope.buildProjectId,
      provider: PROVIDER,
      environment: scope.environment,
      cartToken: token,
      secretStore: scope.secretStore,
    });
  }

  async function executeExisting(
    input: Readonly<{ cartToken: unknown; buyerIp: string }>,
    operation: (remoteCartId: string, buyerIp: string) => Promise<ShopifyRemoteCartSnapshot>,
  ): Promise<ShopifyOpaqueCartSnapshot> {
    const buyerIp = buyer(input.buyerIp);
    const stored = await existing(input.cartToken);
    const cart = await operation(stored.remoteCartId, buyerIp);
    if (cart.remoteCartId !== stored.remoteCartId) reject();
    return publicSnapshot(stored.cartToken, cart, stored.currency);
  }

  return {
    async create(input: Readonly<{ merchandiseId: string; quantity: number; buyerIp: string }>) {
      const remote = await scope.cartPort.createCart({
        merchandiseId: input.merchandiseId,
        quantity: input.quantity,
        buyerIp: buyer(input.buyerIp),
      });
      // Persist the secret-bearing raw cart ID before returning anything.
      const saved = await createExternalCommerceCartHandle(client, {
        buildProjectId: scope.buildProjectId,
        provider: PROVIDER,
        environment: scope.environment,
        remoteCartId: remote.remoteCartId,
        currency: remote.currency,
        secretStore: scope.secretStore,
      });
      return publicSnapshot(saved.cartToken, remote, saved.currency);
    },
    async read(input: Readonly<{ cartToken: unknown; buyerIp: string }>) {
      return executeExisting(input, (remoteCartId, buyerIp) =>
        scope.cartPort.getCart({ remoteCartId, buyerIp }));
    },
    async add(input: Readonly<{ cartToken: unknown; merchandiseId: string; quantity: number; buyerIp: string }>) {
      return executeExisting(input, (remoteCartId, buyerIp) =>
        scope.cartPort.addLine({ remoteCartId, merchandiseId: input.merchandiseId,
          quantity: input.quantity, buyerIp }));
    },
    async update(input: Readonly<{ cartToken: unknown; merchandiseId: string; quantity: number; buyerIp: string }>) {
      return executeExisting(input, (remoteCartId, buyerIp) =>
        scope.cartPort.updateLine({ remoteCartId, merchandiseId: input.merchandiseId,
          quantity: input.quantity, buyerIp }));
    },
    async remove(input: Readonly<{ cartToken: unknown; merchandiseId: string; buyerIp: string }>) {
      return executeExisting(input, (remoteCartId, buyerIp) =>
        scope.cartPort.removeLine({ remoteCartId, merchandiseId: input.merchandiseId, buyerIp }));
    },
  };
}
