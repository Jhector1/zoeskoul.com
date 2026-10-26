import { describe, expect, it, vi } from "vitest";
import { fetchAuthoritativeAppliedProject } from "./fetchAuthoritativeAppliedProject";

const project = {
  buildProjectId: "project-123", codeProjectId: "code-123", title: "Demo",
  description: null, status: "draft", stackId: "static-html-v1",
  sourceVersion: 5, language: "html",
  workspace: { version: 2, language: "html", activeFileId: "f1",
    nodes: [{id:"f1",kind:"file",name:"index.html",parentId:null,
      content:"<h1>Updated</h1>",createdAt:1,updatedAt:2}] },
};
function fetchResult(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: {"content-type":"application/json"},
  }));
}
describe("E17C saved source in-place rehydration", () => {
  it("loads the authenticated authoritative workspace at the exact applied version", async () => {
    const fetchImpl = fetchResult({ok:true,project});
    const latest = await fetchAuthoritativeAppliedProject({
      buildProjectId:"project-123", expectedSourceVersion:5,fetchImpl,
    });
    expect(latest.workspace.nodes).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/build/projects/project-123", {credentials:"same-origin",cache:"no-store"});
  });
  it("rejects conflicting source versions instead of replacing newer editor state", async () => {
    await expect(fetchAuthoritativeAppliedProject({
      buildProjectId:"project-123",expectedSourceVersion:4,
      fetchImpl:fetchResult({ok:true,project}),
    })).rejects.toThrow("did not match");
  });
  it("rejects wrong project ownership and missing workspace", async () => {
    for (const changed of [{...project,buildProjectId:"other"},{...project,workspace:null}]) {
      await expect(fetchAuthoritativeAppliedProject({
        buildProjectId:"project-123",expectedSourceVersion:5,
        fetchImpl:fetchResult({ok:true,project:changed}),
      })).rejects.toThrow("did not match");
    }
  });
  it("fails closed on unauthorized or malformed response", async () => {
    for (const result of [{ok:false,project:null},{ok:true,project}]) {
      const status = result.ok?403:200;
      await expect(fetchAuthoritativeAppliedProject({
        buildProjectId:"project-123",expectedSourceVersion:5,
        fetchImpl:fetchResult(result,status),
      })).rejects.toThrow("did not match");
    }
  });
});
