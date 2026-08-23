import { createApiClient } from "@zoeskoul/api-client";
import { getLocalAppOrigin, getProductionAppOrigin } from "@zoeskoul/app-config";

export function adminApi(apiOrigin: string) {
  return createApiClient({
    baseOrigin: apiOrigin,
  });
}

export function withSearch(pathname: string, search: string) {
  if (!search) return pathname;
  return `${pathname}${search.startsWith("?") ? search : `?${search}`}`;
}


function isLocalBrowser() {
  if (typeof window === "undefined") return true;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function defaultAdminApiOrigin() {
  const configured = import.meta.env.VITE_API_ORIGIN?.trim();
  if (configured) return configured;

  return isLocalBrowser()
    ? getLocalAppOrigin("website")
    : getProductionAppOrigin("website");
}

export function defaultWebsiteOrigin() {
  const configured = import.meta.env.VITE_WEBSITE_ORIGIN?.trim();
  if (configured) return configured;

  return isLocalBrowser()
    ? getLocalAppOrigin("website")
    : getProductionAppOrigin("website");
}

export function websiteHref(pathname: string) {
  return new URL(pathname, defaultWebsiteOrigin()).toString();
}

export function adminFetch(
  pathname: string,
  init: RequestInit = {},
) {
  return adminApi(defaultAdminApiOrigin()).raw(pathname, init);
}
