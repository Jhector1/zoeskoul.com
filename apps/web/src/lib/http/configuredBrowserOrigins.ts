function normalizeConfiguredOrigin(
  value: string,
): string | null {
  const candidate = value.trim();

  if (!candidate || candidate === "*") {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    const isSecure = parsed.protocol === "https:";
    const isLocalHttp =
      parsed.protocol === "http:" &&
      (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1"
      );

    if (
      (!isSecure && !isLocalHttp) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function parseConfiguredBrowserOrigins(
  value: string | undefined,
): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map(normalizeConfiguredOrigin)
      .filter(
        (origin): origin is string =>
          Boolean(origin),
      ),
  );
}

export function getConfiguredBrowserOrigins(): Set<string> {
  return parseConfiguredBrowserOrigins(
    process.env
      .NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS,
  );
}

export function isConfiguredBrowserOrigin(
  origin: string,
): boolean {
  try {
    return getConfiguredBrowserOrigins().has(
      new URL(origin).origin,
    );
  } catch {
    return false;
  }
}
