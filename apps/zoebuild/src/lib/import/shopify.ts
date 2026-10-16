import type {
  ShopifyStoreIdentity,
} from "@zoeskoul/build-imports";
import {
  parseShopifyStoreIdentity,
} from "@zoeskoul/build-imports";

export type ShopifyImportDraft = {
  storeUrl: string;
  hostname: string;
};

export function parseShopifyStoreUrl(
  value: string,
): ShopifyImportDraft | null {
  let store: ShopifyStoreIdentity;

  try {
    store =
      parseShopifyStoreIdentity(value);
  } catch {
    return null;
  }

  return {
    storeUrl: store.origin,
    hostname: store.hostname,
  };
}
