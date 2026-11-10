import { describe, expect, it } from "vitest";
import { verifyV6StartupSnapshot } from "./v6StartupSnapshotGuard";
import type { WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
const file = (path:string, content:string):WorkspaceSyncEntry => ({kind:"file",path,content});
const dir = (path:string):WorkspaceSyncEntry => ({kind:"directory",path});
describe("V6 startup snapshot verification",()=>{
    it("accepts identical bytes regardless of ordering",()=>{
        expect(verifyV6StartupSnapshot({expected:[file("a.txt","one"),dir("docs")],actual:[dir("docs"),file("a.txt","one")]}).ok).toBe(true);
    });
    it("blocks a reused Runner with changed content",()=>{
        expect(verifyV6StartupSnapshot({expected:[file("notes.txt","browser")],actual:[file("notes.txt","runner")]})).toEqual({ok:false,reason:"workspace_mismatch",divergentPaths:["notes.txt"]});
    });
    it("ignores Runner internal paths and the terminal history sidecar",()=>{
        expect(verifyV6StartupSnapshot({expected:[file("notes.txt","a")],actual:[file("notes.txt","a"),file(".zoeskoul/state","system"),file(".bash_history","history")]}).ok).toBe(true);
    });
    it("blocks a reused Runner with extra or missing files",()=>{
        expect(verifyV6StartupSnapshot({expected:[file("a.txt","a")],actual:[file("b.txt","b")]}).divergentPaths).toEqual(["a.txt","b.txt"]);
    });
});
