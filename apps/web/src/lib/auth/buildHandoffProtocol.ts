import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const HANDOFF_TICKET_SECONDS = 60;
// Sessions idle out after 24 hours, but visible authenticated tabs refresh their
// Redis lease through Web's revocable, server-only handoff authority.
export const BUILD_SESSION_SECONDS = 24 * 60 * 60;
export const BUILD_HANDOFF_COOKIE = "__Host-zoebuild-handoff";
export const BUILD_SESSION_COOKIE = "__Host-zoebuild-session";

/** Keep production HTTPS-only; allow literal loopback HTTP only in local dev. */
export function isDevelopmentLoopbackHandoffOrigin(origin: URL): boolean {
  return process.env.NODE_ENV === "development" && origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    !origin.username && !origin.password && origin.pathname === "/" &&
    !origin.search && !origin.hash;
}

export function randomOpaque(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isOpaque(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{42,45}$/.test(value);
}

export function safeBuilderPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 1200 || !value.startsWith("/") ||
      value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/en/projects";
  }
  try {
    const parsed = new URL(value, "https://example.invalid");
    if (parsed.origin !== "https://example.invalid" || parsed.pathname.startsWith("//") ||
        parsed.pathname.startsWith("/api/") || parsed.pathname === "/authenticate" ||
        parsed.pathname.startsWith("/authenticate/")) return "/en/projects";
    return parsed.pathname + parsed.search;
  } catch {
    return "/en/projects";
  }
}

export function handoffBuilderOrigin(): string {
  const raw = process.env.ZOESKOUL_BUILD_HANDOFF_ORIGIN?.trim();
  if (!raw) throw new Error("ZOESKOUL_BUILD_HANDOFF_ORIGIN is required");
  const u = new URL(raw);
  if (u.origin !== raw.replace(/\/$/, "") || u.username || u.password ||
      (u.protocol !== "https:" && !isDevelopmentLoopbackHandoffOrigin(u))) {
    throw new Error("Untrusted build handoff origin");
  }
  return u.origin;
}

export function handoffServiceSecret(): string {
  const secret = process.env.ZOESKOUL_BUILD_HANDOFF_SECRET?.trim();
  if (!secret || secret.length < 48) throw new Error("Secure handoff secret is not configured");
  return secret;
}

export function isServiceAuthorized(header: string | null): boolean {
  const secret = handoffServiceSecret();
  return !!header && constantTimeEqual(header, `Bearer ${secret}`);
}
