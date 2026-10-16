/**
 * Canonical browser-facing path guard for the opaque React preview capability.
 *
 * Next's optional catch-all route can receive the capability root without the
 * trailing slash even though Vite's registered base path ends in "/". Normalize
 * only that exact root form. Nested content must still remain under basePath.
 */
export function normalizeReactPreviewProxyPath(input: Readonly<{
  pathname: string;
  basePath: string;
}>): string | null {
  const { pathname, basePath } = input;

  if (!basePath.endsWith("/")) {
    return null;
  }

  const rootWithoutTrailingSlash = basePath.slice(0, -1);

  if (pathname === rootWithoutTrailingSlash) {
    return basePath;
  }

  if (!pathname.startsWith(basePath)) {
    return null;
  }

  return pathname;
}
