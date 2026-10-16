import "server-only";

import {
  resolveZoeBuildOrigins,
} from "@/lib/appOrigins";

function configured(
  name: string,
): string | null {
  const value =
    process.env[name]?.trim();

  return value || null;
}

function enabledValue(
  value: string,
): boolean {
  return [
    "1",
    "true",
    "yes",
    "on",
  ].includes(
    value
      .trim()
      .toLowerCase(),
  );
}

function disabledValue(
  value: string,
): boolean {
  return [
    "0",
    "false",
    "no",
    "off",
  ].includes(
    value
      .trim()
      .toLowerCase(),
  );
}

function isProductionDeployment(): boolean {
  return (
    process.env.NODE_ENV ===
      "production" ||
    process.env.VERCEL_ENV ===
      "production"
  );
}

/**
 * V1 isolation guard for user-generated HTML.
 *
 * For Zoéskoul's .com deployment this intentionally requires the published
 * site origin to live on a different registrable-domain boundary from the
 * authenticated ZoeBuild control plane.
 *
 * It is deliberately conservative rather than attempting to implement the
 * full Public Suffix List inside the application.
 */
function registrableBoundaryHint(
  hostname: string,
): string {
  const labels =
    hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .split(".")
      .filter(Boolean);

  if (labels.length <= 2) {
    return labels.join(".");
  }

  return labels
    .slice(-2)
    .join(".");
}

export function isZoeBuildPublishEnabled(): boolean {
  const configuredValue =
    configured(
      "ZOEBUILD_PUBLISH_ENABLED",
    );

  if (configuredValue) {
    if (
      enabledValue(
        configuredValue,
      )
    ) {
      return true;
    }

    if (
      disabledValue(
        configuredValue,
      )
    ) {
      return false;
    }

    return false;
  }

  // Development stays usable without weakening the production gate.
  return (
    process.env.NODE_ENV ===
    "development"
  );
}

export function resolveZoeBuildPublishedSiteOrigin(): string {
  const configuredOrigin =
    configured(
      "ZOEBUILD_PUBLISHED_SITE_ORIGIN",
    );

  if (
    !configuredOrigin &&
    process.env.NODE_ENV ===
      "development"
  ) {
    return (
      resolveZoeBuildOrigins()
        .zoebuildOrigin
    );
  }

  if (!configuredOrigin) {
    throw new Error(
      "ZOEBUILD_PUBLISHED_SITE_ORIGIN is required for production publishing.",
    );
  }

  let published: URL;

  try {
    published =
      new URL(
        configuredOrigin,
      );
  } catch {
    throw new Error(
      "ZOEBUILD_PUBLISHED_SITE_ORIGIN must be an absolute URL.",
    );
  }

  if (
    ![
      "http:",
      "https:",
    ].includes(
      published.protocol,
    ) ||
    published.username ||
    published.password ||
    published.pathname !== "/" ||
    published.search ||
    published.hash
  ) {
    throw new Error(
      "ZOEBUILD_PUBLISHED_SITE_ORIGIN must be a clean HTTP(S) origin without path, credentials, query, or hash.",
    );
  }

  if (
    isProductionDeployment()
  ) {
    if (
      published.protocol !==
      "https:"
    ) {
      throw new Error(
        "Production ZoeBuild published sites require HTTPS.",
      );
    }

    const control =
      new URL(
        resolveZoeBuildOrigins()
          .zoebuildOrigin,
      );

    if (
      registrableBoundaryHint(
        published.hostname,
      ) ===
      registrableBoundaryHint(
        control.hostname,
      )
    ) {
      throw new Error(
        "Production user-generated sites must use a separate registrable domain from the ZoeBuild authenticated control plane.",
      );
    }
  }

  return published.origin;
}

export function isPublishedSiteOriginRequest(
  request: Request,
): boolean {
  try {
    return (
      new URL(
        request.url,
      ).origin ===
      resolveZoeBuildPublishedSiteOrigin()
    );
  } catch {
    return false;
  }
}
