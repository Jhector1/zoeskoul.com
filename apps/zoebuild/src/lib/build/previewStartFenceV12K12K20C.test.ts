import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const read=(path:string)=>readFileSync(resolve(import.meta.dirname,"../../",path),"utf8");
describe("K20C preview fencing wiring",()=>{
 it("rechecks source after runner start and after document verification",()=>{
   const start=read("app/api/build/projects/[buildProjectId]/preview/start/route.ts");
   const status=read("app/api/build/projects/[buildProjectId]/preview/operations/[operationId]/route.ts");
   expect(start).toContain("submitTrustedReactPreviewOperationAtRunner");
   expect((status.match(/requireOwnedReactPreviewProject/g)??[]).length).toBeGreaterThanOrEqual(3);
   expect(status).toContain("BUILD_PREVIEW_SOURCE_CONFLICT");
 });
 it("sync verifies source after runner mutation before acknowledging browser",()=>{
   const s=read("app/api/build/projects/[buildProjectId]/preview/[previewId]/sync/route.ts");
   expect(s).toContain("const afterSync = await requireOwnedReactPreviewProject");
   expect(s).toContain("BUILD_PREVIEW_SOURCE_CONFLICT");
 });
});
