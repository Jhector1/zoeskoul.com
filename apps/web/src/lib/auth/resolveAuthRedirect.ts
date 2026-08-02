import {
  getLocalAppOrigin,
  getProductionAppOrigin,
  isTrustedBrowserAppOrigin,
  normalizeSupportedLocale,
} from "@zoeskoul/app-config";

import {
  isConfiguredBrowserOrigin,
} from "@/lib/http/configuredBrowserOrigins";

export function resolveAuthRedirect(args: {
  url: string;
  baseUrl: string;
  includeLocalApps: boolean;
  fallbackPath?: string;
}): string {
  const baseOrigin = new URL(args.baseUrl).origin;
  const fallbackUrl = new URL(
    args.fallbackPath ?? "/en",
    baseOrigin,
  ).toString();

  if (args.url.startsWith("/") && !args.url.startsWith("//")) {
    return new URL(args.url, baseOrigin).toString();
  }

  try {
    const parsed = new URL(args.url);

    if (
      !parsed.username &&
      !parsed.password &&
      (
        parsed.origin === baseOrigin ||
        isTrustedBrowserAppOrigin(parsed.origin, {
          includeLocal: args.includeLocalApps,
        }) ||
        isConfiguredBrowserOrigin(parsed.origin)
      )
    ) {
      return parsed.toString();
    }
  } catch {
    // Invalid and untrusted callback values fall through to the website.
  }

  return fallbackUrl;
}

export function resolveRequestedAuthCallback(args: {
  rawCallbackUrl: string | null | undefined;
  locale: string;
  includeLocalApps: boolean;
}): string {
  const locale =
    normalizeSupportedLocale(args.locale);
  const baseUrl = args.includeLocalApps
    ? getLocalAppOrigin("website")
    : getProductionAppOrigin("website");

  return resolveAuthRedirect({
    url: String(
      args.rawCallbackUrl ?? "",
    ).trim(),
    baseUrl,
    includeLocalApps:
      args.includeLocalApps,
    fallbackPath: `/${locale}`,
  });
}
