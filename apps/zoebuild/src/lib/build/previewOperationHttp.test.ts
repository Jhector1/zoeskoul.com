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
