import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {readOwnedDevelopmentPreviewBrowserContent} from "@/lib/build/reactPreviewDevelopmentBrowserRead";
import {GET,HEAD} from "./route";
vi.mock("@/lib/build/reactPreviewDevelopmentBrowserRead",()=>({readOwnedDevelopmentPreviewBrowserContent:vi.fn()}));
const previewId="preview_11111111-1111-4111-8111-111111111111";
const token="dpv1."+"a".repeat(110);
const prefix=`https://app.example/api/build/projects/project_1/preview/${previewId}/development/content/${token}/`;
const ctx={params:Promise.resolve({buildProjectId:"project_1",previewId,token,path:["@vite","client"]})};
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","true");
 vi.mocked(readOwnedDevelopmentPreviewBrowserContent).mockResolvedValue(new Response("safe",{status:200}));
});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E2B2 tokenized read-only public HTTP",()=>{
 it("does not call authority when disabled",async()=>{
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED","false");
  expect((await GET(new Request(prefix),ctx)).status).toBe(404);
  expect(readOwnedDevelopmentPreviewBrowserContent).not.toHaveBeenCalled();
 });
 it("passes only raw relative GET/HEAD path, never request headers",async()=>{
  expect((await GET(new Request(prefix+"@vite/client?import"),ctx)).status).toBe(200);
  expect(readOwnedDevelopmentPreviewBrowserContent).toHaveBeenCalledWith({
    token,previewId,buildProjectId:"project_1",path:"@vite/client?import",method:"GET",accept:"*/*",
  });
  expect((await HEAD(new Request(prefix+"src/main.css",{headers:{accept:"text/css"}}),ctx)).status).toBe(200);
  expect(readOwnedDevelopmentPreviewBrowserContent).toHaveBeenCalledWith({
    token,previewId,buildProjectId:"project_1",path:"src/main.css",method:"HEAD",accept:"text/css",
  });
 });
 it("refuses malformed paths and upstream denials without leaking detail",async()=>{
  expect((await GET(new Request(prefix+"x/%252e%252e/z"),ctx)).status).toBe(404);
  vi.mocked(readOwnedDevelopmentPreviewBrowserContent).mockRejectedValueOnce(Error("private Runner capability"));
  const answer=await GET(new Request(prefix+"src/main.tsx"),ctx);
  expect(answer.status).toBe(404);
  expect(await answer.text()).not.toContain("capability");
 });
});
