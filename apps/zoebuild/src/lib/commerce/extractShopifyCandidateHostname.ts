/**
 * Display-only Shopify candidate extraction from a user-provided request.
 * Never treats a hostname as a connection, authorization, or credential.
 * Ambiguous requests are deliberately ignored rather than guessing a shop.
 */
export function extractShopifyCandidateHostname(input: string): string | null {
  if (typeof input !== "string") return null;
  const domainPattern = /(^|[^a-z0-9.@_-])([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com)(?![a-z0-9.@_-])/gi;
  const candidates = new Set<string>();
  for (const match of input.matchAll(domainPattern)) {
    const hostname = match[2]?.toLowerCase();
    if (hostname) candidates.add(hostname);
    if (candidates.size > 1) return null;
  }
  return candidates.values().next().value ?? null;
}
