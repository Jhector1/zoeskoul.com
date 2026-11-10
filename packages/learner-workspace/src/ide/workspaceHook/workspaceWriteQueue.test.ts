import {describe,it,expect} from "vitest";
import {createWorkspaceWriteQueue} from "./workspaceWriteQueue";

describe("ordered local draft writes", () => {
    it("never lets an older async write overwrite a newer one", async () => {
        const queue=createWorkspaceWriteQueue();
        let release!:()=>void;
        const latch=new Promise<void>(resolve=>{release=resolve;});
        const order:string[]=[];
        const first=queue.enqueue("tab-a",async()=>{await latch;order.push("old");});
        const second=queue.enqueue("tab-a",async()=>{order.push("new");});
        await Promise.resolve();
        expect(order).toEqual([]);
        release();
        await Promise.all([first,second,queue.flush("tab-a")]);
        expect(order).toEqual(["old","new"]);
    });
    it("does not strand new drafts after a failed write",async()=>{
        const queue=createWorkspaceWriteQueue();
        const order:string[]=[];
        const bad=queue.enqueue("tab-a",async()=>{throw new Error("db lost");});
        const next=queue.enqueue("tab-a",async()=>{order.push("recovered");});
        await expect(bad).rejects.toThrow("db lost");
        await next;
        expect(order).toEqual(["recovered"]);
    });
    it("separate tab drafts do not block one another",async()=>{
        const queue=createWorkspaceWriteQueue();
        let release!:()=>void;
        const slow=new Promise<void>(resolve=>{release=resolve;});
        const one=queue.enqueue("tab-a",()=>slow);
        let fast=false;
        await queue.enqueue("tab-b",async()=>{fast=true;});
        expect(fast).toBe(true);
        release();await one;
    });
});
