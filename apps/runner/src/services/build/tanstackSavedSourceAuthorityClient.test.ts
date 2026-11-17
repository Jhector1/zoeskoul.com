import { describe, expect, it, vi } from "vitest";
import { assertCurrentTanstackSavedSourceAtZoeBuild } from "./tanstackSavedSourceAuthorityClient.js";

const endpoint = "https://zoebuild.example.test/api/internal/build/preview-source-authority";
const secret = "s".repeat(40);
const actor = `u:${"a".repeat(64)}`;
const request = {
  protocolVersion:1 as const,operation:"production-build" as const,
  buildProjectId:"build-1",sourceVersion:8,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
  files:[{path:"package.json",content:"{}"},{path:"pnpm-lock.yaml",content:"lock"}],
};

const invoke = (fetchImpl: typeof fetch, overrides: Record<string,unknown>={}) =>
  assertCurrentTanstackSavedSourceAtZoeBuild(actor, request, {
    endpoint,secret,fetchImpl,...overrides,
  });

describe("Phase 4B Runner-to-ZoeBuild source authority client", () => {
  it("sends full saved-source candidate and private secret to the expected endpoint", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ok:true}), {status:200}));
    await expect(invoke(mockFetch as typeof fetch)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({method:"POST",redirect:"error",cache:"no-store"});
    expect(JSON.parse(String(init.body))).toEqual({actorKey:actor,request});
    expect((init.headers as Record<string,string>)["x-zoebuild-preview-authority"]).toBe(secret);
  });
  it("fails closed on stale revision and server outage", async () => {
    for (const status of [403,409,503])
      await expect(invoke(vi.fn(async () => new Response('{"ok":false}',{status})) as typeof fetch)).rejects.toThrow("rejected");
    await expect(invoke(vi.fn(async () => {throw new Error("network error")}) as typeof fetch)).rejects.toThrow("rejected");
    await expect(invoke(vi.fn(async () => new Response('{"ok":false}',{status:200})) as typeof fetch)).rejects.toThrow("rejected");
  });
  it("rejects unconfigured, untrusted or malformed authority URL before sending", async () => {
    const network = vi.fn();
    for (const unsafe of ["file:///tmp/read", "https://evil.test/path", "https://user:pw@example.test/api/internal/build/preview-source-authority", "https://example.test/api/internal/build/preview-source-authority?key=1"])
      await expect(invoke(network as typeof fetch,{endpoint:unsafe})).rejects.toThrow("endpoint");
    await expect(invoke(network as typeof fetch,{secret:"short"})).rejects.toThrow("not configured");
    expect(network).not.toHaveBeenCalled();
  });
});
