import { describe, expect, it, vi } from "vitest";
import { readPreviewOperationStatus } from "./previewOperationHttp";
const ok = (status: number, body: object = {}) => new Response(JSON.stringify(body), {status});
describe("preview operation renewal never bypasses authority", () => {
  it("does not renew on an ordinary pending or ready operation", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(200));
    expect((await readPreviewOperationStatus("/api/build/preview/operations/op", fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("renews a rejected read once then rechecks the same operation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(401))
      .mockResolvedValueOnce(ok(200, {authenticated:true}))
      .mockResolvedValueOnce(ok(200));
    expect((await readPreviewOperationStatus("/operation", fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({method:"GET",credentials:"same-origin"});
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/auth/handoff/renew");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/operation");
  });
  it("does not retry if renewal failed or lacked authenticated identity", async () => {
    for (const second of [ok(401), ok(200,{authenticated:false}),ok(200,{ok:true})]) {
      const fetcher=vi.fn().mockResolvedValueOnce(ok(401)).mockResolvedValueOnce(second);
      expect((await readPreviewOperationStatus("/operation",fetcher)).status).toBe(401);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
  it("does not loop indefinitely after a second 401", async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(ok(401))
      .mockResolvedValueOnce(ok(200,{authenticated:true})).mockResolvedValueOnce(ok(401));
    expect((await readPreviewOperationStatus("/operation",fetcher)).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});


describe("Wave 3 transient preview-status recovery", () => {
  it("retries a gateway failure on the exact same GET, without creating an operation", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(ok(503, {ok:false,code:"BUILD_PREVIEW_RUNNER_UNAVAILABLE"}))
        .mockResolvedValueOnce(ok(200, {ok:true}));
      const pending = readPreviewOperationStatus("/same-operation", fetcher);
      await vi.runAllTimersAsync();
      expect((await pending).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
      for (const call of fetcher.mock.calls) {
        expect(call[0]).toBe("/same-operation");
        expect(call[1]).toMatchObject({method:"GET",credentials:"same-origin"});
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after two retries and returns a persistent temporary failure", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockImplementation(async () =>
        ok(503, {ok:false,code:"BUILD_PREVIEW_RUNNER_UNAVAILABLE"}));
      const pending = readPreviewOperationStatus("/same-operation", fetcher);
      await vi.runAllTimersAsync();
      expect((await pending).status).toBe(503);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a nontransient 503, 409, 429, or 403", async () => {
    for (const [status, body] of [
      [503, {code:"BUILD_PREVIEW_STATUS_FAILED"}],
      [409, {code:"BUILD_PREVIEW_SOURCE_CONFLICT"}],
      [429, {code:"BUILD_PREVIEW_CAPACITY"}],
      [403, {code:"BUILD_FORBIDDEN"}],
    ] as const) {
      const fetcher = vi.fn().mockResolvedValue(ok(status, body));
      expect((await readPreviewOperationStatus("/same-operation", fetcher)).status).toBe(status);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a thrown network error for an idempotent GET only", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn()
        .mockRejectedValueOnce(new TypeError("network interrupted"))
        .mockResolvedValueOnce(ok(200));
      const pending = readPreviewOperationStatus("/same-operation", fetcher);
      await vi.runAllTimersAsync();
      expect((await pending).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
