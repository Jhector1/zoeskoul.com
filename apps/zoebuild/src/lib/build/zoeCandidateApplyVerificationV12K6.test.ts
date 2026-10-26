import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const edit=readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url),"utf8");
const apply=edit.slice(edit.indexOf("export async function PATCH("));

describe("V12K6 server-authoritative React edit compile gate",()=>{
  it("validates base version and exact edits before runner and source commit",()=>{
    expect(apply.indexOf("project.sourceVersion !== body.baseVersion")).toBeLessThan(apply.indexOf("const workspace = applyZoeEditsToWorkspace"));
    expect(apply.indexOf("const workspace = applyZoeEditsToWorkspace")).toBeLessThan(apply.indexOf("const verification = await verifyZoeReactCandidateAtRunner"));
    expect(apply.indexOf("const verification = await verifyZoeReactCandidateAtRunner")).toBeLessThan(apply.indexOf("const saved = await saveBuildProjectSourceCommand"));
  });
  it("validates unknown HTTP edit data before workspace application and runner verification",()=>{
    const validated = 'const validatedEdits = validateZoeEdits(project.workspace, body.edits);';
    const applied = 'const workspace = applyZoeEditsToWorkspace(project.workspace, validatedEdits);';
    expect(apply).toContain(validated);
    expect(apply).toContain(applied);
    expect(apply).toContain('edits:validatedEdits, specification:project.specification,');
    expect(apply.indexOf(validated)).toBeLessThan(apply.indexOf(applied));
    expect(apply.indexOf(applied)).toBeLessThan(apply.indexOf('const verification = await verifyZoeReactCandidateAtRunner'));
    expect(apply).not.toContain('edits:body.edits, specification:project.specification,');
    expect(apply).not.toContain('as readonly ZoeSourceEdit[]');
  });
  it("never trusts client verification claims and blocks unverified saves without AI calls",()=>{
    expect(apply).toContain('sourceKind:"candidate", correlationId:requestId');
    expect(apply).toContain('if (verification.state !== "passed")');
    expect(apply).toContain('code:"BUILD_EDIT_BUILD_NOT_VERIFIED"');
    expect(apply).not.toContain("body.buildVerification");
    expect(apply).not.toContain("generateJsonText(");
  });
});
