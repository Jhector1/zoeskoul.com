import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runnerPost } from "./runnerClient";

const requestId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.stubEnv("RUNNER_BASE_URL", "https://runner.example.test");
  vi.stubEnv("RUNNER_SHARED_SECRET", "s".repeat(40));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ok:true}), {
    status:200,headers:{"content-type":"application/json"},
  })));
});
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("Runner request correlation", () => {
  it("forwards only a validated request id", async () => {
    await expect(runnerPost("/diagnostic", "actor", {}, {requestId}))
      .resolves.toEqual({ok:true});
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("x-request-id")).toBe(requestId);
  });

  it("rejects malformed correlation before transport", async () => {
    await expect(runnerPost("/diagnostic", "actor", {}, {requestId:"private-url"}))
      .rejects.toThrow("Invalid Runner request correlation.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
