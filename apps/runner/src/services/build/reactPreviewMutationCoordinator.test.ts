import {describe,it,expect} from "vitest";
import {ReactPreviewMutationCoordinator,assertNotStaleReactPreviewSource} from "./reactPreviewMutationCoordinator.js";

describe("K20C runner preview mutation fencing",()=>{
 it("refuses a lower saved source even for the same preview",()=>{
   expect(()=>assertNotStaleReactPreviewSource(57,55)).toThrow("stale");
   expect(()=>assertNotStaleReactPreviewSource(57,57)).not.toThrow();
   expect(()=>assertNotStaleReactPreviewSource(57,58)).not.toThrow();
 });
 it("serializes overlapping writes to one preview, without blocking other previews",async()=>{
   const queue=new ReactPreviewMutationCoordinator();const order:string[]=[];
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
   const first=queue.run("p1",async()=>{order.push("begin-old");await gate;order.push("finish-old");});
   const second=queue.run("p1",async()=>{order.push("new");});
   const other=queue.run("p2",async()=>{order.push("other");});
   await other;
   expect(order).toEqual(["begin-old","other"]);
   release();await Promise.all([first,second]);
   expect(order).toEqual(["begin-old","other","finish-old","new"]);
 });
 it("does not poison the queue after an operation rejects",async()=>{
   const queue=new ReactPreviewMutationCoordinator();
   await expect(queue.run("p",async()=>{throw new Error("network") })).rejects.toThrow();
   await expect(queue.run("p",async()=>"recovered")).resolves.toBe("recovered");
 });
});
