import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolveZoeBuildOrigins } from "@/lib/appOrigins";
import { isAppSessionResponse, type AppSessionResponse } from "@zoeskoul/api-contracts";

export const HANDOFF_COOKIE = "__Host-zoebuild-handoff";
export const SESSION_COOKIE = "__Host-zoebuild-session";
// Must match Web's BUILD_SESSION_SECONDS; a visible tab renews both leases.
export const SESSION_SECONDS = 24 * 60 * 60;

/** HTTP is permitted only for loopback origins under a local dev server. */
export function isDevelopmentLoopbackOrigin(origin: URL): boolean {
  return process.env.NODE_ENV === "development" && origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    !origin.username && !origin.password && origin.pathname === "/" &&
    !origin.search && !origin.hash;
}

export const EMPTY_SESSION: AppSessionResponse = {
  authenticated: false, user: null, roles: [], capabilities: [],
};

export function randomOpaque(): string { return randomBytes(32).toString("base64url"); }
export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function isOpaque(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{42,45}$/.test(value);
}
export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8"); const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 1200 || !value.startsWith("/") || value.startsWith("//") ||
      value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/en/projects";
  try {
    const u = new URL(value, "https://example.invalid");
    if (u.origin !== "https://example.invalid" || u.pathname.startsWith("/api/") ||
        u.pathname.startsWith("/authenticate")) return "/en/projects";
    return u.pathname + u.search;
  } catch { return "/en/projects"; }
}
function secret(): string {
  const value = process.env.ZOESKOUL_BUILD_HANDOFF_SECRET?.trim();
  if (!value || value.length < 48) throw new Error("Build handoff secret unavailable");
  return value;
}
export function requireHandoffOrigins() {
  const { websiteOrigin, zoebuildOrigin } = resolveZoeBuildOrigins();
  const web = new URL(websiteOrigin);
  const localWeb = isDevelopmentLoopbackOrigin(web);
  const localBuilder = isDevelopmentLoopbackOrigin(new URL(zoebuildOrigin));
  if ((web.protocol !== "https:" && !localWeb) ||
      (new URL(zoebuildOrigin).protocol !== "https:" && !localBuilder)) {
    throw new Error("Build handoff requires HTTPS except on loopback in local development");
  }
  return { websiteOrigin, zoebuildOrigin };
}
async function websiteServicePost(path: string, payload: object, timeoutMs = 4500): Promise<Response> {
  const { websiteOrigin } = requireHandoffOrigins();
  return fetch(new URL(path, websiteOrigin), {
    method: "POST", headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
  });
}
export async function exchangeHandoff(ticket: string, state: string, sessionToken: string): Promise<boolean> {
  const response = await websiteServicePost("/api/auth/build-handoff/exchange", {
    ticket, state, sessionHash: sha256(sessionToken),
  });
  if (!response.ok) return false;
  const body = await response.json() as { ok?: unknown };
  return body.ok === true;
}
export type BuilderSessionAuthorityStatus =
  | { kind: "authenticated"; session: AppSessionResponse }
  | { kind: "expired" }
  | { kind: "unavailable" };

/** Distinguish genuinely invalid cookies from an unavailable Web/Redis authority.
 * No cached identity is accepted during outages. This is a read-only probe. */
export async function readBuilderSessionStatus(sessionToken: string | undefined): Promise<BuilderSessionAuthorityStatus> {
  if (!isOpaque(sessionToken)) return { kind: "expired" };
  try {
    // A dev Web route may cold compile; 4.5 seconds misclassifies this as logout.
    const response = await websiteServicePost("/api/auth/build-handoff/session", {
      sessionHash: sha256(sessionToken),
    }, 15000);
    if (!response.ok) return { kind: "unavailable" };
    const payload: unknown = await response.json();
    if (!isAppSessionResponse(payload)) return { kind: "unavailable" };
    if (!payload.authenticated || !payload.user?.id) return { kind: "expired" };
    return { kind: "authenticated", session: payload };
  } catch { return { kind: "unavailable" }; }
}

/** Existing non-billing consumers still fail closed on Web outages. */
export async function readBuilderSession(sessionToken: string | undefined): Promise<AppSessionResponse> {
  const checked = await readBuilderSessionStatus(sessionToken);
  return checked.kind === "authenticated" ? checked.session : EMPTY_SESSION;
}
export type BuilderSessionRenewal =
  | { kind: "authenticated"; session: AppSessionResponse }
  | { kind: "expired" }
  | { kind: "unavailable" };

/** Do not confuse upstream outages with a revoked browser session. */
export async function renewBuilderSession(sessionToken: string | undefined): Promise<BuilderSessionRenewal> {
  if (!isOpaque(sessionToken)) return { kind: "expired" };
  try {
    const response = await websiteServicePost("/api/auth/build-handoff/renew", {
      sessionHash: sha256(sessionToken),
    }, 15000);
    if (!response.ok) return { kind: "unavailable" };
    const payload: unknown = await response.json();
    if (!isAppSessionResponse(payload)) return { kind: "unavailable" };
    if (!payload.authenticated || !payload.user?.id) return { kind: "expired" };
    return { kind: "authenticated", session: payload };
  } catch { return { kind: "unavailable" }; }
}

export async function revokeBuilderSession(sessionToken: string | undefined): Promise<boolean> {
  if (!isOpaque(sessionToken)) return true;
  try {
    const response = await websiteServicePost("/api/auth/build-handoff/revoke", { sessionHash: sha256(sessionToken) });
    return response.ok;
  } catch { return false; }
}

/** A fixed Web-owned billing operation authenticated by this exact host-only
 * ZoeBuild session. No user ID, login token or client-selected origin crosses
 * the browser interface. The Web authority verifies Redis revocation first. */
export async function requestBuilderAiCreditService(
  sessionToken: string | undefined,
  command: Readonly<{ action: "catalog" } | { action: "checkout"; priceId: string; checkoutAttemptId: string } |
    { action: "checkout"; purchaseKind: "custom"; amountUsdMinor: number; checkoutAttemptId: string }>,
): Promise<Response | null> {
  if (!isOpaque(sessionToken)) return null;
  return websiteServicePost("/api/billing/zoebuild-ai-credits", {
    ...command, sessionHash: sha256(sessionToken),
  }, 20000);
}
