import {describe,expect,it,vi} from "vitest";
import {fetchAuthoritativeCurrentBuildProject} from "./fetchAuthoritativeAppliedProject";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const read = (path:string) => readFileSync(join(process.cwd(),"src",path),"utf8");
const project = {buildProjectId:"one", codeProjectId:"c",title:"Saved",status:"draft",
  sourceVersion:31,workspace:{version:2,language:"tsx",nodes:[]}};
describe("V12K12K9 authoritative preview sync",()=>{
  it("reads saved project without writing or creating revisions",async()=>{
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,project}),{status:200}));
    const saved=await fetchAuthoritativeCurrentBuildProject({buildProjectId:"one",fetchImpl});
    expect(saved.sourceVersion).toBe(31);
    expect(fetchImpl).toHaveBeenCalledWith("/api/build/projects/one",{
      credentials:"same-origin",cache:"no-store",
    });
  });
  it("refuses malformed, unauthenticated and wrong-project responses",async()=>{
    for(const [candidate,status] of [[project,403],[{...project,buildProjectId:"two"},200],
       [{...project,workspace:null},200]] as const){
      await expect(fetchAuthoritativeCurrentBuildProject({buildProjectId:"one",fetchImpl:vi.fn(async()=>
        new Response(JSON.stringify({ok:true,project:candidate}),{status}))})).rejects.toThrow();
    }
  });
  it("guards unsaved edits and races and handles conflict on both preview paths",()=>{
    const shell=read("app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    const hook=read("components/builder/useReactVitePreview.ts");
    expect(shell).toContain("codeDirtyRef.current || assistantRequestInFlight.current");
    expect(shell).toContain("previewSourceTokenRef.current !== attemptedSourceVersion");
    expect(shell).not.toContain("internal saved-source revision");
    expect(shell).toContain("setEditorHydrationEpoch(current => current + 1)");
    expect(shell).toContain("activeEditorEpochRef.current !== editorHydrationEpoch");
    // Sync, start, and asynchronous operation-status polling each fence the
    // saved revision. All three must recognize authoritative 409 conflicts.
    expect(hook.match(/BUILD_PREVIEW_SOURCE_CONFLICT/g)).toHaveLength(3);
    expect(hook).toContain('response.status === 409 && data?.code === "BUILD_PREVIEW_SOURCE_CONFLICT"');
    expect(hook).toContain('statusResponse.status === 409 && statusPayload?.code === "BUILD_PREVIEW_SOURCE_CONFLICT"');
    expect(hook).toContain("setResyncFromVersion(attemptedVersion)");
    expect(hook).toContain("triedResyncVersionsRef.current.has(attemptedVersion)");
    expect(hook).not.toContain("Reload source v");
  });
});
