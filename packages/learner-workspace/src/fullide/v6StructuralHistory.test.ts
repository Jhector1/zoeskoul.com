import {describe,expect,it} from "vitest";
import {V6StructuralHistory, v6SubtreeSignature, supportsV6StructuralHistory} from "./v6StructuralHistory";
import type {WorkspaceExplorerExecutorV6,WorkspaceExplorerIntentV6} from "@zoeskoul/learner-workspace/runner/runtime";
import type {WorkspaceSyncEntry} from "@zoeskoul/code-contracts";

const dir = (path:string): WorkspaceSyncEntry => ({kind:"directory",path}) as WorkspaceSyncEntry;
const txt = (path:string,content:string): WorkspaceSyncEntry => ({kind:"file",path,content}) as WorkspaceSyncEntry;
const bin = (path:string,data:string): WorkspaceSyncEntry => ({kind:"file",path,encoding:"base64",data,sizeBytes:3}) as WorkspaceSyncEntry;
const snap = (items: WorkspaceSyncEntry[]) => async () => items;
const RID1="a".repeat(32), RID2="b".repeat(32);

function mockExecutor(result?: {trashId?:string}) {
    const calls:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent => {
        calls.push(intent);
        return {state:"reconciliation_required",kind:intent.kind,path:intent.path,...result};
    };
    return {calls,executor};
}

describe("V6 Runner-backed structural history",()=>{
 it("fingerprints text, binary and empty folders without another subtree",()=>{
    const items=[dir("a"),txt("a/file.txt","hello"),bin("a/p.png","AAEC"),txt("other.txt","else")];
    const first=v6SubtreeSignature(items,"a");
    expect(first).toBeTruthy();
    expect(first).toBe(v6SubtreeSignature([...items].reverse(),"a"));
    expect(first).not.toBe(v6SubtreeSignature([dir("a"),txt("a/file.txt","changed"),bin("a/p.png","AAEC")],"a"));
    expect(v6SubtreeSignature(items,"missing")).toBeNull();
 });
 it("trashes, restores, and re-trashes a directory using fresh token",async()=>{
    const h=new V6StructuralHistory();
    const before=[dir("work"),txt("work/notes.txt","important")];
    const after:WorkspaceSyncEntry[]=[];
    expect(h.record({kind:"trash_directory",path:"work"},
       {state:"reconciliation_required",kind:"trash_directory",path:"work",trashId:RID1},before,after)).toBe(true);
    expect(h.canUndo).toBe(true);
    let present=after;
    const calls:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
        calls.push(intent);
        present=intent.kind==="restore_directory"?before:after;
        return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:present,
           ...(intent.kind==="trash_directory"?{trashId:RID2}:{})};
    };
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[0]).toEqual({kind:"restore_directory",path:"work",trashId:RID1});
    expect(h.canRedo).toBe(true);
    await h.redo(executor,()=>Promise.resolve(present));
    expect(calls[1]).toEqual({kind:"trash_directory",path:"work"});
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[2]).toEqual({kind:"restore_directory",path:"work",trashId:RID2});
 });
 it("tracks folder create/undo/redo and does not reapply a browser snapshot",async()=>{
    const h=new V6StructuralHistory();
    const original:WorkspaceSyncEntry[]=[];
    const created=[dir("new")];
    expect(h.record({kind:"mkdir",path:"new"},{state:"reconciliation_required",kind:"mkdir",path:"new"},original,created)).toBe(true);
    let present=created;
    const calls:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
       calls.push(intent);
       present=intent.kind==="rmdir"?original:created;
       return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:present};
    };
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[0]).toEqual({kind:"rmdir",path:"new"});
    expect(h.canRedo).toBe(true);
    await h.redo(executor,()=>Promise.resolve(present));
    expect(calls[1]).toEqual({kind:"mkdir",path:"new"});
    expect(h.canUndo).toBe(true);
 });
 it("refuses undo if a terminal edited a created folder",async()=>{
    const h=new V6StructuralHistory();
    h.record({kind:"mkdir",path:"new"},{state:"reconciliation_required",kind:"mkdir",path:"new"},[],[dir("new")]);
    const x=mockExecutor();
    await expect(h.undo(x.executor,snap([dir("new"),txt("new/manual.txt","modified")]))).rejects.toThrow(/changed in the terminal/);
    expect(x.calls).toHaveLength(0);
    expect(h.canUndo).toBe(false);
 });
 it("reverses and redoes file moves with CAS-backed executor",async()=>{
    const h=new V6StructuralHistory();
    const orig=[txt("a.txt","bytes")], moved=[txt("b.txt","bytes")];
    h.record({kind:"move_file",path:"a.txt",destinationPath:"b.txt"},
      {state:"reconciliation_required",kind:"move_file",path:"a.txt",destinationPath:"b.txt"},orig,moved);
    let present=moved;
    const x=mockExecutor();
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
        present=intent.kind==="move_file" && intent.destinationPath==="a.txt"?orig:moved;
        await x.executor(intent);
        return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:present};
    };
    await h.undo(executor,()=>Promise.resolve(present));
    await h.redo(executor,()=>Promise.resolve(present));
    expect(x.calls).toEqual([
      {kind:"move_file",path:"b.txt",destinationPath:"a.txt"},
      {kind:"move_file",path:"a.txt",destinationPath:"b.txt"},
    ]);
 });
 it("restores exact text bytes after delete and re-deletes on redo",async()=>{
    const h=new V6StructuralHistory();
    const original=[txt("src/notes.txt","é\nhello 😀")];
    expect(h.record({kind:"delete_file",path:"src/notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"src/notes.txt"},original,[])).toBe(true);
    let present:WorkspaceSyncEntry[]=[];
    const calls:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
       calls.push(intent);
       present=intent.kind==="restore_file"?original:[];
       return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:present};
    };
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[0]).toEqual({kind:"restore_file",path:"src/notes.txt",entry:original[0]});
    await h.redo(executor,()=>Promise.resolve(present));
    expect(calls[1]).toEqual({kind:"delete_file",path:"src/notes.txt"});
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[2]).toEqual({kind:"restore_file",path:"src/notes.txt",entry:original[0]});
 });
 it("restores original binary base64 with correct byte size",async()=>{
    const h=new V6StructuralHistory();
    const original=[bin("photo.png","AAEC")];
    expect(h.record({kind:"delete_file",path:"photo.png"},
      {state:"reconciliation_required",kind:"delete_file",path:"photo.png"},original,[])).toBe(true);
    let present:WorkspaceSyncEntry[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
       if(intent.kind==="restore_file") {
         expect(intent.entry).toMatchObject({encoding:"base64",data:"AAEC",sizeBytes:3});
         present=original;
       }
       return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:present};
    };
    await h.undo(executor,()=>Promise.resolve(present));
 });
 it("blocks Undo if terminal recreated the deleted path",async()=>{
    const h=new V6StructuralHistory();
    const original=[txt("notes.txt","original")];
    expect(h.record({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt"},original,[])).toBe(true);
    const x=mockExecutor();
    await expect(h.undo(x.executor,snap([txt("notes.txt","newer")]))).rejects.toThrow(/changed in the terminal/);
    expect(x.calls).toHaveLength(0);
    expect(h.canUndo).toBe(false);
 });
 it("does not treat an unconfirmed delete as an undoable file",()=>{
    const h=new V6StructuralHistory();
    expect(supportsV6StructuralHistory({kind:"delete_file",path:"notes.txt"})).toBe(true);
    expect(h.record({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt"},[],[])).toBe(false);
    expect(h.canUndo).toBe(false);
 });
 it("records from the reconciled mutation snapshot without a second export",()=>{
    const h=new V6StructuralHistory();
    const before=[txt("notes.txt","server bytes")];
    expect(h.recordReconciled({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt",files:[]},before)).toBe(true);
    expect(h.canUndo).toBe(true);
    expect(h.recordReconciled({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt"},before)).toBe(false);
    expect(h.canUndo).toBe(false);
 });
 it("checks pre-Undo snapshot once and trusts only the reconciled result afterwards",async()=>{
    const h=new V6StructuralHistory();
    const before=[txt("notes.txt","original")];
    h.recordReconciled({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt",files:[]},before);
    let snapshotCalls=0;
    const snapshot=async()=>{snapshotCalls++; if(snapshotCalls>1) throw new Error("POST_MUTATION_EXPORT_FORBIDDEN"); return [];};
    const executor:WorkspaceExplorerExecutorV6=async intent=>
      ({state:"reconciliation_required",kind:intent.kind,path:intent.path,files:before});
    await h.undo(executor,snapshot);
    expect(snapshotCalls).toBe(1);
    expect(h.canRedo).toBe(true);
 });
 it("fails closed when Undo result lacks an authoritative snapshot",async()=>{
    const h=new V6StructuralHistory();
    const before=[txt("notes.txt","original")];
    h.record({kind:"delete_file",path:"notes.txt"},
      {state:"reconciliation_required",kind:"delete_file",path:"notes.txt"},before,[]);
    await expect(h.undo(async intent=>({state:"reconciliation_required",kind:intent.kind,path:intent.path}),
      async()=>[])).rejects.toThrow(/verified reconciled/);
    expect(h.canUndo).toBe(false);
 });

 it("creates a new text file through Runner history and Undo/Redo",async()=>{
    const h=new V6StructuralHistory();
    const created=[txt("src/new.txt","")];
    const intent={kind:"create_file" as const,path:"src/new.txt"};
    expect(h.record(intent,{state:"reconciliation_required",...intent},[],created)).toBe(true);
    let present:WorkspaceSyncEntry[]=created;
    const calls:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async next=>{
       calls.push(next);present=next.kind==="delete_file"?[]:created;
       return {state:"reconciliation_required",kind:next.kind,path:next.path,files:present};
    };
    await h.undo(executor,()=>Promise.resolve(present));
    expect(calls[0]).toEqual({kind:"delete_file",path:"src/new.txt"});
    await h.redo(executor,()=>Promise.resolve(present));
    expect(calls[1]).toEqual(intent);
    await h.undo(executor,()=>Promise.resolve(present));
    expect(h.canRedo).toBe(true);
 });
 it("refuses to undo new files if terminal changed their bytes",async()=>{
    const h=new V6StructuralHistory();
    const intent={kind:"create_file" as const,path:"x.txt"};
    expect(h.record(intent,{state:"reconciliation_required",...intent},[],[txt("x.txt","")])).toBe(true);
    const x=mockExecutor();
    await expect(h.undo(x.executor,snap([txt("x.txt","terminal edit")]))).rejects.toThrow(/changed in the terminal/);
    expect(x.calls).toHaveLength(0);
 });
 it("rejects ambiguous file creation poststate",()=>{
    const h=new V6StructuralHistory();
    const intent={kind:"create_file" as const,path:"x.txt"};
    expect(h.record(intent,{state:"reconciliation_required",...intent},[],[txt("x.txt","not empty")])).toBe(false);
    expect(h.canUndo).toBe(false);
 });

 it("records a committed content edit and replays checked before/after bytes",async()=>{
    const h=new V6StructuralHistory();
    const before=txt("notes.txt","first");
    const after=txt("notes.txt","second");
    expect(h.recordCommittedFiles([{path:"notes.txt",before,after}],[after])).toBe(true);
    let current:WorkspaceSyncEntry[]=[after];
    const seen:WorkspaceExplorerIntentV6[]=[];
    const executor:WorkspaceExplorerExecutorV6=async intent=>{
        seen.push(intent);
        current=[intent.kind==="replace_file" && "entry" in intent ? intent.entry : after];
        return {state:"reconciliation_required",kind:intent.kind,path:intent.path,files:current};
    };
    await h.undo(executor,()=>Promise.resolve(current));
    expect(seen[0]).toEqual({kind:"replace_file",path:"notes.txt",entry:before});
    await h.redo(executor,()=>Promise.resolve(current));
    expect(seen[1]).toEqual({kind:"replace_file",path:"notes.txt",entry:after});
 });
 it("records an acknowledged new-file writer commit into the shared history",async()=>{
    const h=new V6StructuralHistory();
    expect(h.recordCommittedFiles([{path:"created.txt",before:null,after:txt("created.txt","one")}],
        [txt("created.txt","one")])).toBe(true);
    expect(h.canUndo).toBe(true);
 });
 it("rejects a remotely changed content edit before a history action",async()=>{
    const h=new V6StructuralHistory();
    h.recordCommittedFiles([{path:"notes.txt",before:txt("notes.txt","a"),after:txt("notes.txt","b")}],
        [txt("notes.txt","b")]);
    const x=mockExecutor();
    await expect(h.undo(x.executor,snap([txt("notes.txt","terminal changed")]))).rejects.toThrow(/changed in the terminal/);
    expect(x.calls).toHaveLength(0);
 });
 it("refuses to record an edit if the authenticated snapshot disagrees",()=>{
    const h=new V6StructuralHistory();
    expect(h.recordCommittedFiles([{path:"notes.txt",before:txt("notes.txt","a"),after:txt("notes.txt","b")}],
        [txt("notes.txt","unexpected")])).toBe(false);
    expect(h.canUndo).toBe(false);
 });

});
