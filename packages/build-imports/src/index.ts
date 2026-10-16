export const SHOPIFY_IMPORT_SCOPE_PROFILES = {
  theme: [
    "read_themes",
  ],
  storefront: [
    "read_themes",
    "read_products",
    "read_files",
  ],
} as const;

export type ShopifyImportScopeProfile =
  keyof typeof SHOPIFY_IMPORT_SCOPE_PROFILES;

export type ShopifyImportScope =
  (typeof SHOPIFY_IMPORT_SCOPE_PROFILES)[ShopifyImportScopeProfile][number];

export const DEFAULT_SHOPIFY_IMPORT_SCOPE_PROFILE:
  ShopifyImportScopeProfile =
    "storefront";

export const SHOPIFY_IMPORT_LIMITS = {
  hostnameChars: 253,
  products: 1_000,
  files: 2_000,
  themes: 50,
} as const;

export type ShopifyStoreIdentity = Readonly<{
  hostname: string;
  origin: string;
}>;

export type ShopifyAuthorizationRequest = Readonly<{
  store: ShopifyStoreIdentity;
  redirectUri: string;
  state: string;
  scopes: readonly ShopifyImportScope[];
}>;

export type ShopifyAuthorizationRedirect = Readonly<{
  url: string;
}>;

export type ShopifyAuthorizationCode = Readonly<{
  store: ShopifyStoreIdentity;
  code: string;
  state: string;
}>;

/**
 * Token-bearing authorization results are infrastructure-only and short-lived.
 * Domain/application code must hand the token immediately to a SecretStore
 * adapter and retain only the returned secretRef.
 */
export type ShopifyAuthorizationCredential = Readonly<{
  accessToken: string;
  scopes: readonly string[];
  expiresAt: string | null;
}>;

export interface ShopifyAuthorizationPort {
  createAuthorizationRedirect(
    request: ShopifyAuthorizationRequest,
  ): Promise<ShopifyAuthorizationRedirect>;

  exchangeAuthorizationCode(
    request: ShopifyAuthorizationCode,
  ): Promise<ShopifyAuthorizationCredential>;
}

export type ShopifyImportedTheme = Readonly<{
  providerId: string;
  name: string;
  role: string | null;
}>;

export type ShopifyImportedProduct = Readonly<{
  providerId: string;
  handle: string;
  title: string;
}>;

export type ShopifyImportedFile = Readonly<{
  providerId: string;
  url: string;
  alt: string | null;
}>;

export type ShopifyImportSnapshot = Readonly<{
  version: 1;
  store: ShopifyStoreIdentity;
  themes: readonly ShopifyImportedTheme[];
  products: readonly ShopifyImportedProduct[];
  files: readonly ShopifyImportedFile[];
}>;

export interface ShopifyImportPort {
  importStore(input: Readonly<{
    store: ShopifyStoreIdentity;
    secretRef: string;
    limits?: Partial<
      typeof SHOPIFY_IMPORT_LIMITS
    >;
  }>): Promise<ShopifyImportSnapshot>;
}

export class ShopifyImportContractError extends Error {
  readonly code = "SHOPIFY_IMPORT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name =
      "ShopifyImportContractError";
  }
}

export function parseShopifyStoreIdentity(
  value: unknown,
): ShopifyStoreIdentity {
  if (typeof value !== "string") {
    throw new ShopifyImportContractError(
      "Shopify store is required.",
    );
  }

  const raw = value.trim();
  if (!raw) {
    throw new ShopifyImportContractError(
      "Shopify store is required.",
    );
  }

  const candidate =
    raw.includes("://")
      ? raw
      : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ShopifyImportContractError(
      "Shopify store URL is invalid.",
    );
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new ShopifyImportContractError(
      "Shopify store must use HTTP or HTTPS.",
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ShopifyImportContractError(
      "Shopify store URL cannot include credentials, query parameters, or fragments.",
    );
  }

  const hostname =
    url.hostname.trim().toLowerCase();

  if (
    !hostname ||
    hostname.length >
      SHOPIFY_IMPORT_LIMITS.hostnameChars
  ) {
    throw new ShopifyImportContractError(
      "Shopify store hostname is invalid.",
    );
  }

  const isShopifyHosted =
    hostname.endsWith(".myshopify.com");

  const isCustomDomain =
    hostname.includes(".") &&
    !hostname.endsWith(".localhost");

  if (!isShopifyHosted && !isCustomDomain) {
    throw new ShopifyImportContractError(
      "Shopify store hostname is invalid.",
    );
  }

  return {
    hostname,
    origin:
      new URL("/", url.origin).toString(),
  };
}

export function getShopifyImportScopes(
  profile:
    ShopifyImportScopeProfile =
      DEFAULT_SHOPIFY_IMPORT_SCOPE_PROFILE,
): readonly ShopifyImportScope[] {
  return [
    ...SHOPIFY_IMPORT_SCOPE_PROFILES[
      profile
    ],
  ];
}
