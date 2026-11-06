import { describe, expect, it } from "vitest";
import { parseReactPreviewDocumentRequest, previewAssetAccept } from "./reactPreviewDocumentGateway";
const START = "https://build.zoeskoul.com/api/build/projects/p/preview/preview_00000000-0000-0000-0000-000000000000/content/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/preview-document";
const parse=(route:string, revision="0")=>{const url = new URL(START);url.searchParams.set("__zb_preview_route",route);url.searchParams.set("__zb_preview_revision",revision);return parseReactPreviewDocumentRequest(url);};
describe("capability-scoped document gateway request",()=>{
  it("accepts and canonicalizes a selected route",()=>{
    expect(parse("/")).toBe("/");
    expect(parse("/approach?section=values#intro","12")).toBe("/approach?section=values#intro");
  });
  it("rejects unsafe destinations and invalid revision tokens",()=>{
    for(const input of ["//other","http://evil.com","/%2e%2e/path","/%2fadmin","/\\secret","/?__zb_preview_revision=3"])
      expect(parse(input)).toBeNull();
    expect(parse("/", "x")).toBeNull();
    const url=new URL(START);url.searchParams.append("__zb_preview_route","/");url.searchParams.append("__zb_preview_route","/shop");url.searchParams.set("__zb_preview_revision","0");
    expect(parseReactPreviewDocumentRequest(url)).toBeNull();
  });
});


describe("Vite preview stylesheet Accept negotiation", () => {
  it("forwards only an explicit CSS preference for stylesheet requests", () => {
    expect(previewAssetAccept("text/css,*/*;q=0.1")).toBe("text/css");
    expect(previewAssetAccept("TEXT/CSS; q=1, */*;q=.5")).toBe("text/css");
    expect(previewAssetAccept("*/*")).toBe("*/*");
    expect(previewAssetAccept("application/javascript, */*;q=0.8")).toBe("*/*");
    expect(previewAssetAccept(null)).toBe("*/*");
    expect(previewAssetAccept("application/json,text/cssuality")).toBe("*/*");
  });
});
