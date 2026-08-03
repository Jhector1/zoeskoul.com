import {
  normalizeSupportedLocale,
  routePathSegments,
  supportedLocales,
} from "@zoeskoul/app-config";

import {
  resolveAuthRedirect,
} from "./resolveAuthRedirect";

const BLOCKED_LOGOUT_PATHS = [
  "/api/auth",
  "/authenticate",
  "/logout",
  "/auth/error",
] as const;

export type LogoutProvider =
  | "google"
  | "keycloak"
  | "unknown"
  | "signed-out";

function withoutLocale(pathname: string): string {
  const segments = routePathSegments(
    pathname,
  );

  if (
    supportedLocales.includes(
      segments[0] as (typeof supportedLocales)[number],
    )
  ) {
    segments.shift();
  }

  return `/${segments.join("/")}`;
}

function isBlockedLogoutPath(pathname: string): boolean {
  const normalized = withoutLocale(pathname);

  return BLOCKED_LOGOUT_PATHS.some(
    (blocked) =>
      normalized === blocked ||
      normalized.startsWith(`${blocked}/`),
  );
}

export function resolveLogoutRedirect(args: {
  rawRedirect: string | null | undefined;
  baseUrl: string;
  locale: string | null | undefined;
  includeLocalApps: boolean;
}): string {
  const locale = normalizeSupportedLocale(
    args.locale ?? undefined,
  );
  const baseOrigin = new URL(args.baseUrl).origin;
  const fallback = new URL(
    `/${locale}`,
    baseOrigin,
  ).toString();
  const resolved = resolveAuthRedirect({
    url: String(args.rawRedirect ?? "").trim(),
    baseUrl: baseOrigin,
    includeLocalApps: args.includeLocalApps,
    fallbackPath: `/${locale}`,
  });
  const parsed = new URL(resolved);

  // Logout always lands on Web. Returning directly to a protected Vite page
  // would immediately start a new authentication flow.
  if (
    parsed.origin !== baseOrigin ||
    isBlockedLogoutPath(parsed.pathname)
  ) {
    return fallback;
  }

  return parsed.toString();
}

export function resolveLogoutProvider(
  token: unknown,
): LogoutProvider {
  if (
    typeof token !== "object" ||
    token === null
  ) {
    return "signed-out";
  }

  const provider =
    "provider" in token
      ? token.provider
      : undefined;

  if (provider === "google") return "google";
  if (provider === "keycloak") return "keycloak";
  return "unknown";
}

export function readKeycloakIdToken(
  token: unknown,
): string | null {
  if (
    resolveLogoutProvider(token) !== "keycloak" ||
    typeof token !== "object" ||
    token === null ||
    !("kc_id_token" in token) ||
    typeof token.kc_id_token !== "string"
  ) {
    return null;
  }

  const idToken = token.kc_id_token.trim();
  return idToken || null;
}

export function buildKeycloakEndSessionUrl(args: {
  issuer: string | null | undefined;
  clientId: string | null | undefined;
  postLogoutRedirect: string;
  idToken: string | null;
}): string | null {
  const issuer = args.issuer?.trim();
  const clientId = args.clientId?.trim();

  if (!issuer || !clientId) return null;

  try {
    const url = new URL(issuer);

    if (
      (url.protocol !== "https:" &&
        url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }

    url.pathname =
      `${url.pathname.replace(/\/+$/, "")}` +
      "/protocol/openid-connect/logout";
    url.search = "";
    url.hash = "";
    url.searchParams.set("client_id", clientId);
    url.searchParams.set(
      "post_logout_redirect_uri",
      args.postLogoutRedirect,
    );

    if (args.idToken) {
      url.searchParams.set(
        "id_token_hint",
        args.idToken,
      );
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function buildWebLogoutUrl(args: {
  websiteOrigin: string;
  locale: string;
  postLogoutRedirect?: string;
}): string {
  const locale = normalizeSupportedLocale(
    args.locale,
  );
  const websiteOrigin =
    new URL(args.websiteOrigin).origin;
  const url = new URL(
    "/api/auth/logout",
    websiteOrigin,
  );

  url.searchParams.set(
    "postLogoutRedirect",
    new URL(
      args.postLogoutRedirect ??
        `/${locale}`,
      websiteOrigin,
    ).toString(),
  );
  url.searchParams.set("locale", locale);

  return url.toString();
}
