import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({enabled:vi.fn(),exact:vi.fn(),display:vi.fn()}));
vi.mock("@/lib/build/projectThumbnail",()=>({projectThumbnailEnabled:mocks.enabled,readProjectThumbnail:mocks.exact,readProjectThumbnailDisplay:mocks.display}));
import {GET} from "./route";
const request=(display=false,version="3")=>GET(new Request(`http://localhost:3004/api/build/projects/project_test/thumbnail/${version}${display?"?display=1":""}`),{params:Promise.resolve({buildProjectId:"project_test",sourceVersion:version})});
const jpeg=Uint8Array.from([255,216,255,217]);
beforeEach(()=>{vi.resetAllMocks();mocks.enabled.mockReturnValue(true);mocks.exact.mockResolvedValue(null);mocks.display.mockResolvedValue({bytes:null,version:null,capturing:false});});
describe("private thumbnail HTTP responses",()=>{
  it("returns an empty private 204 for an authorized exact miss",async()=>{
    const r=await request();expect(r.status).toBe(204);expect(await r.text()).toBe("");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("content-type")).toBeNull();
  });
  it("preserves pending capture state on a display miss",async()=>{
    mocks.display.mockResolvedValue({bytes:null,version:null,capturing:true});
    const r=await request(true);expect(r.status).toBe(204);expect(r.headers.get("X-ZoeBuild-Thumbnail-Capture")).toBe("pending");expect(await r.text()).toBe("");
  });
  it("preserves image bytes, fallback version and private response headers",async()=>{
    mocks.display.mockResolvedValue({bytes:jpeg,version:2,capturing:true});
    const r=await request(true);expect(r.status).toBe(200);expect(r.headers.get("content-type")).toBe("image/jpeg");expect(r.headers.get("X-ZoeBuild-Thumbnail-Version")).toBe("2");expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");expect(new Uint8Array(await r.arrayBuffer())).toEqual(jpeg);
    mocks.exact.mockResolvedValue(jpeg);expect((await request()).status).toBe(200);
  });
  it("does not expose a cache miss for disabled or malformed requests",async()=>{
    expect((await request(false,"0")).status).toBe(404);mocks.enabled.mockReturnValue(false);expect((await request(true)).status).toBe(404);expect(mocks.exact).not.toHaveBeenCalled();expect(mocks.display).not.toHaveBeenCalled();
  });
  it.each([401,404,409,503])("keeps rejected or failed reads opaque (%s)",async(status)=>{
    const error=Object.assign(new Error("private failure"),{status});mocks.exact.mockRejectedValue(error);mocks.display.mockRejectedValue(error);
    for(const display of [false,true]){const r=await request(display);expect(r.status).toBe(404);expect(r.headers.get("X-ZoeBuild-Thumbnail-Capture")).toBeNull();expect(await r.text()).toBe("");}
  });
});
