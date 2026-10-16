import "server-only";

import {
  buildAuthenticateUrl,
} from "@zoeskoul/auth-client";

import {
  resolveZoeBuildOrigins,
} from "./appOrigins";

function safeZoeBuildCallbackUrl(
  value: string | null | undefined,
  zoebuildOrigin: string,
): string {
  const origin =
    new URL(zoebuildOrigin).origin;

  const fallback =
    new URL("/", origin).toString();

  if (!value?.trim()) {
    return fallback;
  }

  try {
    const resolved =
      new URL(value, origin);

    if (resolved.origin !== origin) {
      return fallback;
    }

    return resolved.toString();
  } catch {
    return fallback;
  }
}

export function buildZoeBuildWebAuthenticateUrl(args: {
  callbackUrl?: string | null;
  locale?: string;
}): string {
  const {
    websiteOrigin,
    zoebuildOrigin,
  } = resolveZoeBuildOrigins();

  return buildAuthenticateUrl({
    websiteOrigin,
    callbackUrl:
      safeZoeBuildCallbackUrl(
        args.callbackUrl,
        zoebuildOrigin,
      ),
    locale: args.locale,
  });
}
