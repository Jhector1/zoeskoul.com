import {
  browserAppIds,
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

import {
  getConfiguredBrowserOrigins,
} from "@/lib/http/configuredBrowserOrigins";

const ALLOWED_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Accept, Content-Type";

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function isLocalApiRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>([
    requestOrigin(request),
    ...browserAppIds.map(getProductionAppOrigin),
  ]);

  for (const origin of getConfiguredBrowserOrigins()) {
    origins.add(origin);
  }

  if (isLocalApiRequest(request)) {
    for (const appId of browserAppIds) {
      origins.add(getLocalAppOrigin(appId));
    }
  }

  return origins;
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");
  const values = new Set(
    (current ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  values.add(value);
  headers.set("Vary", Array.from(values).join(", "));
}

export function isAppOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return allowedOrigins(request).has(origin);
}

export function isAppMutationOriginAllowed(request: Request): boolean {
  return Boolean(request.headers.get("Origin")) &&
    isAppOriginAllowed(request);
}

export function applyAppCorsHeaders(
  request: Request,
  response: Response,
): Response {
  const origin = request.headers.get("Origin");

  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  response.headers.set("Content-Security-Policy", "default-src 'none'");
  appendVary(response.headers, "Origin");
  appendVary(response.headers, "Cookie");

  if (origin && isAppOriginAllowed(request)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }

  return response;
}

export function appCorsJson(
  request: Request,
  data: unknown,
  init?: ResponseInit,
): Response {
  return applyAppCorsHeaders(
    request,
    Response.json(data, init),
  );
}

export function appCorsPreflight(request: Request): Response {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const response = new Response(null, { status: 204 });
  response.headers.set("Access-Control-Max-Age", "600");
  return applyAppCorsHeaders(request, response);
}
