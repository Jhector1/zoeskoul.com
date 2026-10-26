/** Explicit CSRF origin protection for billing mutations in all deployments.
 * Reverse proxies may rewrite request.url to an internal server address. In
 * that case accept ONLY the exact canonical app origin from server config.
 * Never derive an allowed origin from a browser-controlled header.
 */
export function isTrustedBillingMutation(request: Request, configuredOrigin?: string | null): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    if (source.href !== source.origin + "/" || source.username || source.password) return false;
    const target = new URL(request.url);
    if (source.origin === target.origin) return true;

    // The caller MUST supply a server-owned app URL, never Origin, Host,
    // x-forwarded-host, Referer, or anything from the request headers.
    if (!configuredOrigin) return false;
    const configured = new URL(configuredOrigin);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname);
    if (configured.username || configured.password || configured.search || configured.hash ||
        configured.pathname !== "/" ||
        !(configured.protocol === "https:" || (isLoopback && configured.protocol === "http:"))) {
      return false;
    }
    return source.origin === configured.origin;
  } catch { return false; }
}

export function billingLocale(value: unknown): "en" | "fr" | "es" | "ht" {
  return value === "fr" || value === "es" || value === "ht" ? value : "en";
}
