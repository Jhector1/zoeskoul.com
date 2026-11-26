import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const builder = "https://build.zoeskoul.com";
const website = "https://zoeskoul.com";
const path = "/api/auth/handoff/start?returnTo=%2Fen%2Fprojects&locale=en";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_WEBSITE_ORIGIN", website);
  vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_ORIGIN", builder);
});
afterEach(() => vi.unstubAllEnvs());

describe("production handoff through the fixed ingress signer", () => {
  it("uses the public origin even when Next constructs an internal URL", async () => {
    const r = await GET(new NextRequest("https://0.0.0.0:3004" + path, {
      headers: { host: "build.zoeskoul.com", "x-forwarded-proto": "https" },
    }));
    expect(r.status).toBe(303);
    const target = new URL(r.headers.get("location")!);
    expect(target.origin).toBe(website);
    expect(target.pathname).toBe("/en/authenticate");
    const issuer = new URL(target.searchParams.get("callbackUrl")!);
    expect(issuer.origin).toBe(website);
    expect(issuer.pathname).toBe("/api/auth/build-handoff/issue");
    expect(issuer.searchParams.get("returnTo")).toBe("/en/projects");
    expect(issuer.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-zoebuild-handoff=");
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
  });

  it.each([
    { host: "evil.example", "x-forwarded-proto": "https" },
    { host: "build.zoeskoul.com", "x-forwarded-proto": "http" },
    { host: "build.zoeskoul.com", "x-forwarded-proto": "https,http" },
    { host: "build.zoeskoul.com" },
    { host: "evil.example", "x-forwarded-host": "build.zoeskoul.com", "x-forwarded-proto": "https" },
  ])("rejects an invalid production ingress without a redirect or cookie", async (headers) => {
    const r = await GET(new NextRequest("https://0.0.0.0:3004" + path, { headers: new Headers(Object.entries(headers).filter((pair): pair is [string, string] => typeof pair[1] === "string")) }));
    expect(r.status).toBe(400);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("retains canonical relocation outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const r = await GET(new NextRequest("https://other.example" + path));
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location")!).origin).toBe(builder);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});
