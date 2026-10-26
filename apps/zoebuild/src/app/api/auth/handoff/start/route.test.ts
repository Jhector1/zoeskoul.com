import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  websiteOrigin: "http://localhost:3000",
  zoebuildOrigin: "https://dev-build.zoeskoul.com",
}));
vi.mock("@/lib/auth/buildHandoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/buildHandoff")>();
  return {
    ...actual,
    requireHandoffOrigins: () => ({
      websiteOrigin: mocks.websiteOrigin,
      zoebuildOrigin: mocks.zoebuildOrigin,
    }),
  };
});
import { GET } from "./route";

describe("V12J.12D canonical __Host handoff origin", () => {
  it("moves a localhost sign-in to the fixed canonical origin before setting a verifier cookie", async () => {
    const url = "http://localhost:3004/api/auth/handoff/start?returnTo=%2Fen%2Fprojects%2Fabc&locale=en";
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(303);
    const destination = new URL(res.headers.get("location")!);
    expect(destination.origin).toBe(mocks.zoebuildOrigin);
    expect(destination.pathname).toBe("/api/auth/handoff/start");
    expect(destination.searchParams.get("returnTo")).toBe("/en/projects/abc");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("issues verifier only when request origin matches the callback host", async () => {
    const res = await GET(new NextRequest("https://dev-build.zoeskoul.com/api/auth/handoff/start?returnTo=%2Fen%2Fprojects"));
    expect(res.status).toBe(303);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin).toBe(mocks.websiteOrigin);
    expect(url.pathname).toBe("/en/authenticate");
    expect(res.headers.get("set-cookie")).toContain("__Host-zoebuild-handoff=");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });
  it("works without canonicalization when local browser and callback both use localhost", async () => {
    const old=mocks.zoebuildOrigin;
    mocks.zoebuildOrigin="http://localhost:3004";
    try {
      const res = await GET(new NextRequest("http://localhost:3004/api/auth/handoff/start"));
      expect(res.status).toBe(303);
      expect(res.headers.get("set-cookie")).toContain("__Host-zoebuild-handoff=");
      expect(new URL(res.headers.get("location")!).origin).toBe(mocks.websiteOrigin);
    } finally {mocks.zoebuildOrigin=old;}
  });
  it("does not honor an untrusted external return path", async () => {
    const res = await GET(new NextRequest("http://localhost:3004/api/auth/handoff/start?returnTo=https%3A%2F%2Fevil.example"));
    const target=new URL(res.headers.get("location")!);
    expect(target.origin).toBe(mocks.zoebuildOrigin);
    expect(target.searchParams.get("returnTo")).toBe("/en/projects");
  });
});
