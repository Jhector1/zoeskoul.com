import {
  isStudentRouteCutoverReady,
  readRouteLocale,
  resolveDesiredAppRouteOwner,
} from "@zoeskoul/app-config";

import {
  buildStudentAppHref,
  type ZoeSkoulRuntimeEnvironment,
} from "./studentAppHref";

export type StudentRouteHandoffOptions = {
  currentUrl: string;
  environment?: ZoeSkoulRuntimeEnvironment;
  configuredOrigin?: string | null;
};

function parseCurrentUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Builds a cross-application Student URL without activating its route.
 * Website-owned and unknown paths are refused.
 */
export function buildStudentRouteHandoffUrl(
  options: StudentRouteHandoffOptions,
): string | null {
  const currentUrl = parseCurrentUrl(options.currentUrl);
  if (!currentUrl) {
    return null;
  }

  const pathname =
    currentUrl.pathname +
    currentUrl.search +
    currentUrl.hash;

  if (
    resolveDesiredAppRouteOwner({
      pathname,
    }) !== "student"
  ) {
    return null;
  }

  const href = buildStudentAppHref({
    pathname,
    locale: readRouteLocale(currentUrl.pathname),
    environment: options.environment,
    configuredOrigin: options.configuredOrigin,
    currentOrigin: currentUrl.origin,
  });
  const targetUrl = new URL(href);

  // Preview origin configuration fails closed to the current Web origin.
  // Returning null prevents a same-origin redirect loop.
  if (targetUrl.origin === currentUrl.origin) {
    return null;
  }

  return targetUrl.toString();
}

/**
 * Returns a Student handoff only when the route is explicitly activated in
 * @zoeskoul/app-config. Phase 1's allowlist is intentionally empty.
 */
export function resolveStudentRouteHandoff(
  options: StudentRouteHandoffOptions,
): string | null {
  const currentUrl = parseCurrentUrl(options.currentUrl);
  if (!currentUrl) {
    return null;
  }

  const pathname =
    currentUrl.pathname +
    currentUrl.search +
    currentUrl.hash;

  if (
    !isStudentRouteCutoverReady({
      pathname,
    })
  ) {
    return null;
  }

  return buildStudentRouteHandoffUrl(options);
}
