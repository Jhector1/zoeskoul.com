import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { restoreDeletedWorkspaceFileV6 } from "./workspaceFileHistoryRestoreV6";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

const sha=`sha256:${"a".repeat(64)}`;
const txt=(path:string,content:string):WorkspaceSyncEntry=>({kind:"file",path,content}) as WorkspaceSyncEntry;
const png=(path:string,data:string,sizeBytes:number):WorkspaceSyncEntry=>({kind:"file",path,encoding:"base64",data,sizeBytes}) as WorkspaceSyncEntry;

describe("V6 deleted-file history CAS restoration",()=>{
 it("writes Unicode text with expectedRevision null only after a verified absence",async()=>{
   const transport=vi.fn(async (_:string,op:{op:string})=>
       op.op==="read" ? Promise.reject(new WorkspaceFileV6Error("NOT_FOUND",404)):
       op.op==="list" ? {ok:true as const,entries:[]} : {ok:true as const,revision:sha});
   const revision=new WorkspaceFileRevisionV6("session",transport);
   const pending=vi.fn();
   await restoreDeletedWorkspaceFileV6("notes.txt",txt("notes.txt","é 😀"),revision,()=>true,pending);
   expect(pending).toHaveBeenCalledOnce();
   expect(transport.mock.calls.map(x=>x[1].op)).toEqual(["read","list","write"]);
   expect(transport.mock.calls[2][1]).toMatchObject({op:"write",path:"notes.txt",expectedRevision:null,data:"w6kg8J+YgA=="});
 });
 it("writes exact binary bytes and verifies size",async()=>{
   const transport=vi.fn(async (_:string,op:{op:string})=>
     op.op==="read" ? Promise.reject(new WorkspaceFileV6Error("NOT_FOUND",404)):
     op.op==="list" ? {ok:true as const,entries:[]} : {ok:true as const,revision:sha});
   const revision=new WorkspaceFileRevisionV6("session",transport);
   await restoreDeletedWorkspaceFileV6("pic.png",png("pic.png","AAEC",3),revision,()=>true,vi.fn());
   expect(transport.mock.calls[2][1]).toMatchObject({op:"write",path:"pic.png",expectedRevision:null,data:"AAEC"});
 });
 it("refuses restore if another terminal already created that file",async()=>{
   const transport=vi.fn(async () => ({ok:true as const,revision:sha,mode:0o644,data:"Y3VycmVudA=="}));
   const revision=new WorkspaceFileRevisionV6("session",transport);
   const pending=vi.fn();
   await expect(restoreDeletedWorkspaceFileV6("notes.txt",txt("notes.txt","previous"),revision,()=>true,pending))
     .rejects.toMatchObject({code:"CONFLICT"});
   expect(transport).toHaveBeenCalledTimes(1);expect(pending).not.toHaveBeenCalled();
 });
 it("refuses unsafe paths, format changes and corrupt binary without I/O",async()=>{
   const transport=vi.fn();const revision=new WorkspaceFileRevisionV6("session",transport);
   for(const [path,entry] of [
     ["../private.txt",txt("../private.txt","x")],
     [".zoe-v6-trash/a.txt",txt(".zoe-v6-trash/a.txt","x")],
     ["nested/.zoe-v6-trash/a.txt",txt("nested/.zoe-v6-trash/a.txt","x")],
     [".zoe-v6-file-abc.txt",txt(".zoe-v6-file-abc.txt","x")],
     ["project/node_modules/temp.txt",txt("project/node_modules/temp.txt","x")],
     ["project/.zoe-sync-cache.txt",txt("project/.zoe-sync-cache.txt","x")],
     ["photo.png",txt("photo.png","not binary")],
     ["pic.png",png("pic.png","AAEC",4)],
   ] as Array<[string,WorkspaceSyncEntry]>) {
     await expect(restoreDeletedWorkspaceFileV6(path,entry,revision,()=>true,vi.fn())).rejects.toThrow();
   }
   expect(transport).not.toHaveBeenCalled();
 });
 it("refuses a new local edit between verifying absence and writing",async()=>{
   const transport=vi.fn(async (_:string,op:{op:string})=>
      op.op==="read"?Promise.reject(new WorkspaceFileV6Error("NOT_FOUND",404)):{ok:true as const,entries:[]});
   const revision=new WorkspaceFileRevisionV6("session",transport);
   let checks=0;const pending=vi.fn();
   await expect(restoreDeletedWorkspaceFileV6("notes.txt",txt("notes.txt","old"),revision,()=>++checks<2,pending))
     .rejects.toMatchObject({code:"LOCAL_DRAFT_CHANGED"});
   expect(transport.mock.calls.map(x=>x[1].op)).toEqual(["read","list"]);
   expect(pending).not.toHaveBeenCalled();
 });
});
