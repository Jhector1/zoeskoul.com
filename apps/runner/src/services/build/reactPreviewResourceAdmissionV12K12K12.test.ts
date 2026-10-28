import { describe, expect, it } from "vitest";
import { choosePreviewsToReclaim, PreviewStartCoordinator } from "./reactPreviewResourceAdmission.js";

describe("V12K12K12 runner preview resource admission", () => {
  it("keeps a selected project and protects other actors' fresh sessions", () => {
    const records = [
      {ownerKey:"a", buildProjectId:"selected", lastActivityAt:100},
      {ownerKey:"a", buildProjectId:"previous", lastActivityAt:190},
      {ownerKey:"b", buildProjectId:"active", lastActivityAt:170},
      {ownerKey:"c", buildProjectId:"idle", lastActivityAt:10},
    ];
    const reclaim = choosePreviewsToReclaim(records, "a", "selected", 200, 45);
    expect(reclaim.map(r=>r.buildProjectId)).toEqual(["previous", "idle"]);
  });
  it("does not evict another owner's fresh preview or the matching project", () => {
    expect(choosePreviewsToReclaim([
      {ownerKey:"b", buildProjectId:"recent", lastActivityAt:95},
      {ownerKey:"a", buildProjectId:"same", lastActivityAt:1},
    ], "a", "same", 100, 45)).toEqual([]);
  });
  it("serializes concurrent starts, including requests that fail", async () => {
    const q = new PreviewStartCoordinator(3, 1000);
    let finish!: () => void;
    const hold = new Promise<void>(r=>{finish=r});
    const order:string[]=[];
    const a = q.run(async()=>{order.push("a:start");await hold;order.push("a:end");return 1});
    const b = q.run(async()=>{order.push("b");throw new Error("failed")});
    const c = q.run(async()=>{order.push("c");return 3});
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(order).toEqual(["a:start"]);
    finish();
    expect(await a).toBe(1);
    await expect(b).rejects.toThrow("failed");
    expect(await c).toBe(3);
    expect(order).toEqual(["a:start", "a:end", "b", "c"]);
  });
  it("bounds queue size and does not start rejected work", async () => {
    const q = new PreviewStartCoordinator(1,1000);
    let finish!: () => void;
    const hold = new Promise<void>(r=>{finish=r});
    const active = q.run(async()=>{await hold});
    try { await expect(q.run(async()=>{throw new Error("must not run")})).rejects.toThrow("queue is full"); }
    finally {finish();await active;}
    await expect(q.run(async()=>"recovered")).resolves.toBe("recovered");
  });
});
