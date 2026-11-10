import { describe, expect, it } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { waitForV6ImportView } from "./v6ImportViewBarrier";

const file = (content: string): WorkspaceSyncEntry => ({kind:"file",path:"sample.txt",content});
describe("V6 importer view handoff", () => {
    it("waits until the browser reflects the acknowledged Runner snapshot", async () => {
        let count=0;
        await waitForV6ImportView({verified:[file("new")],readView:()=>[file(count>=2?"new":"old")],
            sameSession:()=>true,pause:async()=>{count++;},maxChecks:5});
        expect(count).toBe(2);
    });
    it("does not retry a stale browser snapshot indefinitely", async () => {
        let count=0;
        await expect(waitForV6ImportView({verified:[file("new")],readView:()=>[file("old")],
            sameSession:()=>true,pause:async()=>{count++;},maxChecks:3})).rejects.toThrow("Explorer did not acknowledge");
        expect(count).toBe(3);
    });
    it("accepts successive acknowledged snapshots only after each view update", async () => {
        let current = [file("initial")];
        let checks = 0;
        const pause = async () => { checks++; };
        await waitForV6ImportView({verified:[file("first")],readView:()=>current,
            sameSession:()=>true,pause:async()=>{await pause(); current=[file("first")];},maxChecks:3});
        current=[file("first")];
        await waitForV6ImportView({verified:[file("second")],readView:()=>current,
            sameSession:()=>true,pause:async()=>{await pause(); current=[file("second")];},maxChecks:3});
        expect(checks).toBe(2);
        expect(current).toEqual([file("second")]);
    });
    it("stops immediately when the executor session changes", async () => {
        let count=0;
        await expect(waitForV6ImportView({verified:[file("new")],readView:()=>[file("old")],
            sameSession:()=>count===0,pause:async()=>{count++;},maxChecks:10})).rejects.toThrow("Terminal session changed");
        expect(count).toBe(1);
    });
});
