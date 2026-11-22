import {describe,expect,it,vi} from "vitest";
import {needsSharedPreviewDependencyPreparation as needs, prepareSharedPreviewDependencies as prepare,
  requestSavedPreviewDependencyPreparation as request, savedDependencySelectionKey as key} from "./sharedPreviewDependencyPreparation";
const root=(name:string,parentId:string|null=null)=>({kind:"file",parentId,name});
const selection={buildProjectId:"project_test",sourceVersion:1,restoredDependencyPinned:false};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const setup=(body:unknown,status=200)=>({ ...selection,isCurrent:()=>true,
  fetchClient:vi.fn(async()=>response(body,status)),reconcileConflict:vi.fn(async()=>true),reconcilePrepared:vi.fn(async()=>true)});
describe("U20G shared preview dependency admission",()=>{
 it("requires root lock and approval before either preview starts",()=>{
  expect(needs([root("package.json")])).toBe(true);
  expect(needs([root("pnpm-lock.yaml","folder"),root("zoebuild-dependency-approval.json")])).toBe(true);
  expect(needs([root("pnpm-lock.yaml"),root("zoebuild-dependency-approval.json")])).toBe(false);
 });
 it("sends only the saved revision and existing trusted preparation flags",async()=>{
  const f=vi.fn(async(_path:RequestInfo|URL,_options?:RequestInit)=>response({ok:true}));
  await request(selection,f);
  expect(f.mock.calls[0][0]).toBe("/api/build/projects/project_test/dependency-lock/bootstrap");
  expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({reconcileExisting:true,baseVersion:1,autoRestoreDependencies:false,autoPrepareProjectDependencies:true});
  await request({...selection,restoredDependencyPinned:true},f);
  expect(JSON.parse(String(f.mock.calls[1][1]?.body))).toMatchObject({autoRestoreDependencies:true,autoPrepareProjectDependencies:false});
 });
 it("fences project, revision and restored provenance independently",()=>{
  expect(new Set([key(selection),key({...selection,sourceVersion:2}),key({...selection,buildProjectId:"other"}),key({...selection,restoredDependencyPinned:true})]).size).toBe(4);
 });
 it("rehydrates the new canonical version after one successful bootstrap",async()=>{
  const f=setup({ok:true,bootstrap:{source:{sourceVersion:2}}});
  expect((await prepare(f)).kind).toBe("prepared");expect(f.fetchClient).toHaveBeenCalledOnce();
  expect(f.reconcileConflict).toHaveBeenCalledWith(1);expect(f.reconcilePrepared).not.toHaveBeenCalled();
 });
 it("supports exact restored lock adoption with unchanged version",async()=>{
  const f=setup({ok:true,bootstrap:{source:{sourceVersion:1}}});
  expect((await prepare({...f,restoredDependencyPinned:true})).kind).toBe("prepared");
  expect(f.reconcileConflict).not.toHaveBeenCalled();expect(f.reconcilePrepared).toHaveBeenCalledWith(1);
 });
 it.each(["BUILD_HISTORY_STALE","BUILD_SOURCE_CONFLICT","BUILD_DEPENDENCY_ALREADY_APPROVED"])("reconciles %s without reinstall",async code=>{
  const f=setup({ok:false,code},409);expect((await prepare(f)).kind).toBe("prepared");expect(f.fetchClient).toHaveBeenCalledOnce();
 });
 it("does not overwrite edits made during the request",async()=>{
  let clean=true;const f=setup({ok:true,bootstrap:{source:{sourceVersion:2}}});
  const fetchClient=vi.fn(async()=>{clean=false;return response({ok:true,bootstrap:{source:{sourceVersion:2}}});});
  expect((await prepare({...f,fetchClient,isCurrent:()=>clean})).kind).toBe("superseded");
  expect(f.reconcileConflict).not.toHaveBeenCalled();expect(f.reconcilePrepared).not.toHaveBeenCalled();
 });
 it("does not send a request for an obsolete selection",async()=>{
  const f=setup({});expect((await prepare({...f,isCurrent:()=>false})).kind).toBe("superseded");expect(f.fetchClient).not.toHaveBeenCalled();
 });
 it.each([409,429,503])("does not loop or reconcile on HTTP %s rejection",async status=>{
  const f=setup({ok:false,code:"BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED"},status);
  expect((await prepare(f)).kind).toBe("error");expect(f.fetchClient).toHaveBeenCalledOnce();expect(f.reconcileConflict).not.toHaveBeenCalled();
 });
 it("does not call refresh after malformed success",async()=>{
  const f=setup({ok:true,bootstrap:{source:{sourceVersion:0}}});expect((await prepare(f)).kind).toBe("error");expect(f.reconcilePrepared).not.toHaveBeenCalled();
 });
 it("requires an authoritative refresh, not just bootstrap HTTP 200",async()=>{
  const f=setup({ok:true,bootstrap:{source:{sourceVersion:2}}});
  f.reconcileConflict.mockResolvedValue(false);f.reconcilePrepared.mockResolvedValue(false);
  expect((await prepare(f)).kind).toBe("error");expect(f.fetchClient).toHaveBeenCalledOnce();
 });
});
