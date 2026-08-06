import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "./appCors";

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");
  const values = new Set(
    (current ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

export function trustedWebsiteRequest(request: Request) {
  const headers = new Headers(request.headers);
  const origin = new URL(request.url).origin;
  headers.set("Origin", origin);
  headers.set("Referer", `${origin}/`);
  return new Request(request, { headers });
}

export async function proxyStudentUiRoute(
  request: Request,
  invoke: (trustedRequest: Request) => Promise<Response>,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const response = await invoke(trustedWebsiteRequest(request));
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    appendVary(headers, "Origin");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function studentUiPreflight(request: Request) {
  return appCorsPreflight(request);
}
