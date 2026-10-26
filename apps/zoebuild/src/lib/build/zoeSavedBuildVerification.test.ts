import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/verify-build/route.ts",import.meta.url),"utf8");
const shell=readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",import.meta.url),"utf8");
describe("V12K5C3 saved-source build verification boundary",()=>{
  it("authorizes the current owner and enforces a matching persisted version",()=>{
    expect(route).toContain("enforceSameOriginPost(req)");
    expect(route).toContain("loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})");
    expect(route).toContain("resolveBuildAccess(access).canEditWithAi");
    expect(route).toContain("project.sourceVersion !== requestedVersion");
    expect(route).toContain('project.stackId !== "react-vite-v1"');
  });
  it("builds only the saved server workspace and performs no source mutation or AI calls",()=>{
    expect(route).toContain("workspace:project.workspace,edits:[]");
    expect(route).toContain('sourceKind:"saved",correlationId:requestId');
    expect(route).not.toContain("generateJsonText(");
    expect(route).not.toContain("saveBuildProjectSourceCommand(");
    expect(route).not.toContain("publishOwnedProject(");
  });
  it("keeps an explicit manual retry separate from the proposed edit apply",()=>{
    expect(shell).toContain('Verify saved build (no AI)');
    expect(shell).toContain('zoe-saved-build-verification');
    expect(shell).toContain('JSON.stringify({sourceVersion})');
    expect(shell).toContain('codeDirtyRef.current || assistantRequestInFlight.current');
  });
});
