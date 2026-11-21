import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";

const source=(name:string)=>readFileSync(fileURLToPath(new URL(name,import.meta.url)),"utf8");
describe("AI4B4A media route authorization and isolation",()=>{
  it("enforces current session authority, owner scope and read budgets before listing",()=>{
    const route=source("./route.ts");const helper=source("../../../../../../lib/build/privateBuildMediaHttp.ts");
    expect(helper).toContain("loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})");
    expect(helper).toContain("authorizeBuildMediaOwner({");
    expect(helper).toContain("requirePrivateMediaReadBudget");
    expect(route).toContain("await requirePrivateMediaProject(req,buildProjectId)");
    expect(route).toContain("await requirePrivateMediaReadBudget(userId,scope.buildProjectId)");
    expect(route).not.toContain("ownerId:req");
    expect(route).toContain("actorUserId:userId,buildProjectId:scope.buildProjectId,ownership:bound.ownership");
  });
  it("enforces origin, body limits, rate limit, trusted PNG decoder before writing to R2",()=>{
    const route=source("./route.ts");
    expect(route).toContain("enforceSameOriginPost(req)");
    expect(route).toContain("exceedsContentLength(req,MAX_UPLOAD_BYTES)");
    expect(route).toContain("await limited(userId,scope.buildProjectId)");
    expect(route).toContain("readPrivateMediaUpload(req)");
    expect(route).toContain("inspector:privatePngInspector");
    expect(route).not.toContain("prisma.buildMediaAsset.create(");
  });
  it("returns only scoped, integrity-verified bytes with private response headers",()=>{
    const route=source("./[assetId]/route.ts");
    expect(route).toContain("readPrivateBuildMediaImage({");
    expect(route).toContain("actorUserId:userId,buildProjectId:scope.buildProjectId,ownership:bound.ownership");
    expect(route).toContain("Cache-Control\":\"private, no-store");
    expect(route).toContain("Content-Security-Policy");
    expect(route).not.toContain("getSignedUrl");
    expect(route).not.toContain("r2.dev");
  });
});
