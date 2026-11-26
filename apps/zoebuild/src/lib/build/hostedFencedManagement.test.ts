import { describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{}}));
vi.mock("./currentBuildAccess",()=>({}));
vi.mock("./cloudflareR2MediaServer",()=>({}));
vi.mock("./privatePublishControl",()=>({}));
vi.mock("./hostedFencedPublication",()=>({}));
vi.mock("./hostedFencedRelease",()=>({}));
import { dedicatedFencedUiSelected,parseFencedManagement,dedicatedPrivateSiteUrl } from "./hostedFencedManagement";
const id="cmwvhcusk0002u0dlwhxh9uh2";
const env={NODE_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_HOSTED_PUBLISH_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:id};
const headers=(action:string,generation="9007199254740993",extra:Record<string,string>={})=>new Headers({"x-zoebuild-release-action":action,"x-zoebuild-fenced-generation":generation,...extra});
describe("fenced UI management contract",()=>{
 it("uses the dedicated private gateway URL instead of the editor origin",()=>{
  expect(dedicatedPrivateSiteUrl("tanstack-verity-test.sites.zoebuild.test")).toBe("http://tanstack-verity-test.sites.zoebuild.test:33109/");
  for(const host of ["localhost","example.com","tanstack-verity-test.sites.zoebuild.test:33109","https://tanstack-verity-test.sites.zoebuild.test","evil.sites.zoebuild.test/path"])expect(()=>dedicatedPrivateSiteUrl(host)).toThrow("FENCED_PRIVATE_HOSTNAME_INVALID");
 });
 it("limits admission to the explicit development project",()=>{expect(dedicatedFencedUiSelected(id,env)).toBe(true);expect(dedicatedFencedUiSelected("other",env)).toBe(false);expect(dedicatedFencedUiSelected(id,{...env,VERCEL_ENV:"production"})).toBe(false);expect(dedicatedFencedUiSelected(id,{...env,ZOEBUILD_PUBLISH_ENABLED:"1"})).toBe(false);});
 it("preserves exact bigint generations",()=>{expect(parseFencedManagement(headers("unpublish"))?.generation).toBe(9007199254740993n);for(const x of ["-1","01","9223372036854775807","1.0",""])expect(parseFencedManagement(headers("unpublish",x))).toBeNull();});
 it("requires exact target for rollback",()=>{expect(parseFencedManagement(headers("restore"))).toBeNull();expect(parseFencedManagement(headers("restore","1",{"x-zoebuild-release-target":"a".repeat(64)}))?.action).toBe("restore");});
 it("requires explicit pending operation for recovery or redispatch",()=>{for(const action of ["recover","retry"]){expect(parseFencedManagement(headers(action))).toBeNull();expect(parseFencedManagement(headers(action,"1",{"x-zoebuild-fenced-operation":"operation-one"}))?.operationId).toBe("operation-one");}expect(parseFencedManagement(headers("unpublish","1",{"x-zoebuild-fenced-operation":"operation-one"}))).toBeNull();});
});
