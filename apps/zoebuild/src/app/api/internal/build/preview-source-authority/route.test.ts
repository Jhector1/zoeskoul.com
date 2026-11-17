import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attestCurrentTanstackSavedPreviewSource } from "@/lib/build/reactPreviewSourceAttestationServer";
import { POST } from "./route";

vi.mock("@/lib/build/reactPreviewSourceAttestationServer", () => ({
  attestCurrentTanstackSavedPreviewSource: vi.fn(),
}));

const secret = "t".repeat(40);
const makeRequest = (options: {key?:string; body?:string; size?:string}={}) =>
  new Request("http://localhost/api/internal/build/preview-source-authority", {
    method:"POST", headers: {
      "x-zoebuild-preview-authority":options.key ?? secret,
      ...(options.size ? {"content-length": options.size} : {}),
    },
    body: options.body ?? JSON.stringify({ actorKey:"u:" + "a".repeat(64), request:{sourceVersion:8} }),
  });

beforeEach(() => {
  vi.stubEnv("ZOEBUILD_PREVIEW_AUTHORITY_ENABLED", "true");
  vi.stubEnv("ZOEBUILD_PREVIEW_AUTHORITY_SHARED_SECRET", secret);
  vi.mocked(attestCurrentTanstackSavedPreviewSource).mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Phase 4B private authority endpoint is fail-closed", () => {
  it("stays unavailable when the feature flag is absent", async () => {
    vi.stubEnv("ZOEBUILD_PREVIEW_AUTHORITY_ENABLED", "false");
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(attestCurrentTanstackSavedPreviewSource).not.toHaveBeenCalled();
  });
  it("rejects an invalid secret without querying saved source", async () => {
    expect((await POST(makeRequest({key:"wrong"}))).status).toBe(403);
    expect(attestCurrentTanstackSavedPreviewSource).not.toHaveBeenCalled();
  });
  it("checks saved-source authority, returning only a boolean", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ok:true});
    expect(attestCurrentTanstackSavedPreviewSource).toHaveBeenCalledOnce();
  });
  it("returns conflict on rejected source and 503 on database failure", async () => {
    vi.mocked(attestCurrentTanstackSavedPreviewSource).mockResolvedValueOnce(false);
    expect((await POST(makeRequest())).status).toBe(409);
    vi.mocked(attestCurrentTanstackSavedPreviewSource).mockRejectedValueOnce(new Error("db down"));
    expect((await POST(makeRequest())).status).toBe(503);
  });
  it("rejects oversized and invalid request bodies", async () => {
    expect((await POST(makeRequest({size:String(9*1024*1024)}))).status).toBe(413);
    expect((await POST(makeRequest({body:"invalid json"}))).status).toBe(400);
    expect((await POST(makeRequest({body:JSON.stringify({actorKey:"actor"})}))).status).toBe(400);
    expect(attestCurrentTanstackSavedPreviewSource).not.toHaveBeenCalled();
  });
});
