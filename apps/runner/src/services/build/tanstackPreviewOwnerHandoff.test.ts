import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import {
  fetchOwnedTanstackPreview,
  resolveAdmittedTanstackPreviewCapability,
} from "./tanstackPreviewSharedLifecycle.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

vi.mock("./tanstackPreviewDockerTransport.js", () => ({
  fetchTanstackHttpInsideSandbox: vi.fn(),
}));

const previewId = "preview_test";
const basePath = `/api/build/projects/store1/preview/${previewId}/content/${"A".repeat(32)}/`;
const response = {status:200,headers:{"content-type":"application/json","cache-control":"no-store"},bodyBase64:"e30="};

beforeEach(() => {
  sharedFullStackPreviews.resetForTests();
  sharedFullStackPreviews.register({
    id:previewId,ownerKey:"owner1",buildProjectId:"store1",sourceVersion:17,
    containerId:"container-test",basePath,createdAt:1,lastActivityAt:1,
    close:async()=>undefined,
  });
  vi.mocked(fetchTanstackHttpInsideSandbox).mockReset();
  vi.mocked(fetchTanstackHttpInsideSandbox).mockResolvedValue(response);
});
afterEach(()=>sharedFullStackPreviews.resetForTests());

describe("admitted TanStack preview owner handoff",()=>{
  it("enforces owner, project and exact saved source before any POST reaches Docker",async()=>{
    const base = {ownerKey:"owner1",previewId,buildProjectId:"store1",sourceVersion:17,
      path:basePath+"api/cart",method:"POST" as const,headers:{"content-type":"application/json"},bodyBase64:"e30="};
    await expect(fetchOwnedTanstackPreview({...base,ownerKey:"other"})).rejects.toThrow("Forbidden.");
    await expect(fetchOwnedTanstackPreview({...base,buildProjectId:"other"})).rejects.toThrow("Preview source is stale.");
    await expect(fetchOwnedTanstackPreview({...base,sourceVersion:16})).rejects.toThrow("Preview source is stale.");
    await expect(fetchOwnedTanstackPreview({...base,path:basePath.replace("A", "B")+"api/cart"})).rejects.toThrow();
    expect(fetchTanstackHttpInsideSandbox).not.toHaveBeenCalled();
    await expect(fetchOwnedTanstackPreview(base)).resolves.toEqual(response);
    expect(fetchTanstackHttpInsideSandbox).toHaveBeenCalledWith("container-test",{
      path:"/api/cart",method:"POST",headers:{accept:"*/*","content-type":"application/json"},bodyBase64:"e30=",
    });
  });

  it("does not carry cookies, bearer tokens or browser-selected ports to generated code",async()=>{
    await fetchOwnedTanstackPreview({ownerKey:"owner1",previewId,buildProjectId:"store1",sourceVersion:17,
      path:basePath,method:"GET",headers:{accept:"text/html",cookie:"secret",authorization:"Bearer secret",host:"internal"}});
    expect(fetchTanstackHttpInsideSandbox).toHaveBeenCalledWith("container-test",{
      path:"/",method:"GET",headers:{accept:"text/html"},bodyBase64:"",
    });
  });

  it("resolves only the exact live capability, without authorizing POST",()=>{
    expect(resolveAdmittedTanstackPreviewCapability({previewId,path:basePath})).toEqual({previewId,buildProjectId:"store1",sourceVersion:17});
    expect(()=>resolveAdmittedTanstackPreviewCapability({previewId,path:basePath.replace("A","B")})).toThrow();
  });

  it("keeps route ownership, POST downgrading and activation checks in one place",()=>{
    const read=(name:string)=>readFileSync(fileURLToPath(new URL(`../../routes/${name}`,import.meta.url)),"utf8");
    const fetch=read("build.previews.fetch.ts");
    const proxy=read("build.previews.proxyFetch.ts");
    const resolve=read("build.previews.resolveCapability.ts");
    const cancel=read("build.previews.cancel.ts");
    expect(fetch).toContain("getRequiredActorKey");
    expect(fetch).toContain("fetchOwnedTanstackPreview");
    expect(fetch).toContain('if (method === "POST") return res.status(405)');
    expect(proxy).toContain("fetchAdmittedTanstackPreview");
    expect(proxy).not.toContain("getRequiredActorKey");
    expect(resolve).toContain("resolveAdmittedTanstackPreviewCapability");
    expect(cancel).toContain("stopAdmittedTanstackPreview");
    // No public start route or operation worker is changed in this phase.
    for(const route of [fetch,proxy,resolve,cancel]) {
      expect(route).not.toContain("startAdmittedTanstackPreview");
      expect(route).not.toContain("req.body.command");
      expect(route).not.toContain("req.body.env");
      expect(route).not.toContain("req.body.port");
    }
  });
});
