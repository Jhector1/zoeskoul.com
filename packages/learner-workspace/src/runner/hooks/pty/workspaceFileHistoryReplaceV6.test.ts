import {describe, expect, it, vi} from "vitest";
import {WorkspaceFileRevisionV6} from "./workspaceFileRevisionV6";
import {WorkspaceFileV6Error} from "./workspaceFileClientV6";
import {replaceHistoryWorkspaceFileV6} from "./workspaceFileHistoryRestoreV6";
import type {WorkspaceSyncEntry} from "@zoeskoul/code-contracts";

const revisionId = `sha256:${"a".repeat(64)}`;
const txt = (path:string,content:string):WorkspaceSyncEntry => ({kind:"file",path,content}) as WorkspaceSyncEntry;
const bin = (path:string,data:string,sizeBytes:number):WorkspaceSyncEntry =>
    ({kind:"file",path,encoding:"base64",data,sizeBytes}) as WorkspaceSyncEntry;

describe("V6 acknowledged content history CAS replacement",()=>{
 it("replaces existing Unicode text with the read revision, never an absent precondition",async()=>{
    const transport = vi.fn(async (_:string,op:{op:string}) =>
       op.op === "read" ? {ok:true as const,revision:revisionId,mode:0o644,data:"b2xk"} :
       {ok:true as const,revision:revisionId});
    const rev = new WorkspaceFileRevisionV6("session",transport);
    const uncertain = vi.fn();
    await replaceHistoryWorkspaceFileV6("a.txt",txt("a.txt","old"),txt("a.txt","é 😀"),rev,()=>true,uncertain);
    expect(uncertain).toHaveBeenCalledOnce();
    expect(transport.mock.calls.map(x=>x[1].op)).toEqual(["read","write"]);
    expect(transport.mock.calls[1][1]).toMatchObject({
      op:"write",path:"a.txt",expectedRevision:revisionId,data:"w6kg8J+YgA==",
    });
 });
 it("refuses a terminal change before making any write",async()=>{
    const transport = vi.fn(async () => ({ok:true as const,revision:revisionId,mode:0o644,data:"bmV3ZXI="}));
    const rev = new WorkspaceFileRevisionV6("session",transport);
    const uncertain=vi.fn();
    await expect(replaceHistoryWorkspaceFileV6("a.txt",txt("a.txt","old"),txt("a.txt","edit"),rev,()=>true,uncertain))
       .rejects.toMatchObject({code:"CONFLICT"});
    expect(transport).toHaveBeenCalledOnce();
    expect(uncertain).not.toHaveBeenCalled();
 });
 it("refuses invalid private paths and binary/text format changes with zero I/O",async()=>{
    const transport=vi.fn();const rev=new WorkspaceFileRevisionV6("session",transport);
    for (const [path,oldEntry,newEntry] of [
      [".zoe-v6-trash/a.txt",txt(".zoe-v6-trash/a.txt","old"),txt(".zoe-v6-trash/a.txt","new")],
      ["pkg/node_modules/a.txt",txt("pkg/node_modules/a.txt","old"),txt("pkg/node_modules/a.txt","new")],
      ["a.png",bin("a.png","AAEC",3),txt("a.png","new")],
      ["a.png",bin("a.png","AAEC",3),bin("a.png","AAEC",4)],
      ["../a.txt",txt("../a.txt","old"),txt("../a.txt","new")],
    ] as Array<[string,WorkspaceSyncEntry,WorkspaceSyncEntry]>) {
      await expect(replaceHistoryWorkspaceFileV6(path,oldEntry,newEntry,rev,()=>true,vi.fn()))
        .rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
 });
 it("blocks when the local edit changes after the remote read",async()=>{
    const transport=vi.fn(async ()=>({ok:true as const,revision:revisionId,mode:0o644,data:"b2xk"}));
    const rev=new WorkspaceFileRevisionV6("session",transport);
    let checks=0;const uncertain=vi.fn();
    await expect(replaceHistoryWorkspaceFileV6("a.txt",txt("a.txt","old"),txt("a.txt","edit"),rev,
        ()=>++checks<2,uncertain)).rejects.toMatchObject({code:"LOCAL_DRAFT_CHANGED"});
    expect(transport).toHaveBeenCalledOnce();
    expect(uncertain).not.toHaveBeenCalled();
 });
});
