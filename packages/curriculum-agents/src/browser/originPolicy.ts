export type OriginPolicy = {
  allowedOrigins: ReadonlySet<string>;
};

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  return url.origin;
}

export function createOriginPolicy(
  startUrl: string,
  additionalOrigins: readonly string[] = [],
): OriginPolicy {
  return {
    allowedOrigins: new Set([
      normalizeOrigin(startUrl),
      ...additionalOrigins.map(normalizeOrigin),
    ]),
  };
}

export function isAllowedNavigationUrl(
  rawUrl: string,
  policy: OriginPolicy,
): boolean {
  if (rawUrl === "about:blank") {
    return true;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    policy.allowedOrigins.has(url.origin)
  );
}

export function assertAllowedNavigationUrl(
  rawUrl: string,
  policy: OriginPolicy,
): void {
  if (!isAllowedNavigationUrl(rawUrl, policy)) {
    throw new Error(
      `Student agent navigation blocked by origin policy: ${rawUrl}`,
    );
  }
}
