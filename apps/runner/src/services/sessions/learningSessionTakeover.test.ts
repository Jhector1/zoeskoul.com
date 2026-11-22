import { describe, expect, it } from "vitest";
import type { SessionRecord } from "./sessionStore.js";
import { ADMIN_DETACH_GRACE_MS, STANDARD_DETACH_GRACE_MS, LearningCapacityRecovery, LearningStartQueue, learningSessionTakeoverEnabled, mayReclaimDetachedShell, planDetachedShellReclamation } from "./learningSessionTakeover.js";
const now = 250_000;
function session(id = "old", overrides: Partial<SessionRecord> = {}): SessionRecord {
  return { id, ownerKey: "actor", kind: "shell", labMode: "standard", containerId: `container-${id}`, workspaceDir: "/tmp/test", state: "waiting_for_input", seq: 0, events: [], createdAt: 1000, lastActivityAt: now, transportDetachedAt: 100_000, ...overrides };
}
function plan(sessions: SessionRecord[], overrides: Partial<Parameters<typeof planDetachedShellReclamation>[0]> = {}) {
  return { actor: "actor", now, actorCount: 2, globalCount: 2, actorLimit: 2, globalLimit: 10, sessions, ...overrides };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

describe("disposable learning session capacity recovery", () => {
  it("requires the exact dedicated development configuration", () => {
    expect(learningSessionTakeoverEnabled({ RUNNER_EXECUTION_POOL: "zoeskoul-learning", ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development" })).toBe(true);
    for (const e of [{}, { RUNNER_EXECUTION_POOL: "zoebuild", ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development" }, { RUNNER_EXECUTION_POOL: "zoeskoul-learning", ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "production" }]) expect(learningSessionTakeoverEnabled(e)).toBe(false);
  });
  it("reclaims only the oldest eligible shell at the normal two-slot limit", () => {
    const older = session("older"), newer = session("newer", {createdAt: 2000});
    expect(planDetachedShellReclamation(plan([newer, older])).map(s => s.id)).toEqual(["older"]);
    expect(planDetachedShellReclamation(plan([older], {actorCount: 1}))).toEqual([]);
  });
  it("preserves connected, unknown, preparing, closed and other-user sessions", () => {
    const protectedSessions = [session("connected", {transportDetachedAt: null}),session("unknown", {transportDetachedAt: undefined}),session("preparing", {state:"preparing"}),session("closed", {state:"canceled"}), session("foreign", {ownerKey:"other"}), session("finalized", {finalizedAt: now})];
    expect(planDetachedShellReclamation(plan(protectedSessions))).toEqual([]);
  });
  it("retains code runs and graded admin labs even if disconnected", () => {
    expect(planDetachedShellReclamation(plan([session("code", {kind:"code"}), session("graded", {labMode:"admin",adminTopicSlug:"final-capstone-secure-project"})]))).toEqual([]);
  });
  it("enforces the standard detach grace, independently of idle activity", () => {
    expect(mayReclaimDetachedShell(session("a", {transportDetachedAt:now-STANDARD_DETACH_GRACE_MS+1}),"actor",now)).toBe(false);
    expect(mayReclaimDetachedShell(session("a", {transportDetachedAt:now-STANDARD_DETACH_GRACE_MS}),"actor",now)).toBe(true);
    expect(mayReclaimDetachedShell(session("a", {transportDetachedAt:now+1}),"actor",now)).toBe(false);
  });
  it("gives global full-privileges labs a longer reconnection grace", () => {
    const admin = session("admin", {labMode:"admin", adminTopicSlug:"full-privileges", transportDetachedAt:now-ADMIN_DETACH_GRACE_MS+1});
    expect(mayReclaimDetachedShell(admin,"actor",now)).toBe(false);
    expect(mayReclaimDetachedShell(admin,"actor",now+1)).toBe(true);
  });
  it("does not destructively reclaim if insufficient local or global capacity will result", () => {
    expect(planDetachedShellReclamation(plan([session()],{actorCount:3}))).toEqual([]);
    expect(planDetachedShellReclamation(plan([session()],{globalCount:11}))).toEqual([]);
  });
  it("serializes same-actor starts and does not block other actors", async () => {
    const q = new LearningStartQueue(), barrier = deferred(), trace: string[] = [];
    const a = q.run("actor", async () => { trace.push("first"); await barrier.promise; trace.push("first-done"); });
    const b = q.run("actor", async () => { trace.push("second"); });
    await q.run("other", async () => { trace.push("other"); });
    expect(trace).toEqual(["first","other"]);
    barrier.resolve(); await Promise.all([a,b]);
    expect(trace).toEqual(["first","other","first-done","second"]);
  });
  it("continues the actor queue after a rejected start", async () => {
    const q = new LearningStartQueue();
    const a = q.run("actor", async () => { throw new Error("first failed"); });
    const b = q.run("actor", async () => 7);
    await expect(a).rejects.toThrow("first failed"); expect(await b).toBe(7);
  });
  it("waits for verified teardown before returning from capacity recovery", async () => {
    const recovery = new LearningCapacityRecovery(), old = session(), barrier = deferred();
    let completed = false, called = false;
    const work = recovery.recover("actor", {readPlan:()=>plan([old]), readSession:()=>old, retire:async () => {called=true; await barrier.promise;}}).then(()=>{completed=true;});
    expect(called).toBe(true); expect(completed).toBe(false); barrier.resolve(); await work; expect(completed).toBe(true);
  });
  it("retries a failed physical cleanup even after logical capacity was freed", async () => {
    const recovery = new LearningCapacityRecovery(), old = session(); let fail = true; let calls = 0;
    const deps = {readPlan:()=>plan([old],{actorCount:calls?1:2}),readSession:()=>old,retire:async()=>{calls++;if(fail)throw new Error("daemon unavailable");}};
    await expect(recovery.recover("actor",deps)).rejects.toThrow("cleanup could not be verified");
    await expect(recovery.recover("actor",deps,false)).rejects.toThrow("cleanup could not be verified");
    fail=false; await recovery.recover("actor",deps); expect(calls).toBe(3);
    await recovery.recover("actor",deps); expect(calls).toBe(3);
  });
  it("rechecks identity and attachment before teardown", async () => {
    const recovery = new LearningCapacityRecovery(), old = session(); let calls=0;
    await recovery.recover("actor",{readPlan:()=>plan([old]),readSession:()=>{old.transportDetachedAt=null;return old;},retire:async()=>{calls++;}});
    expect(calls).toBe(0);
    old.transportDetachedAt=100_000;
    await recovery.recover("actor",{readPlan:()=>plan([old]),readSession:()=>session(),retire:async()=>{calls++;}});
    expect(calls).toBe(0);
  });
  it("never lets a graded start choose a new eviction victim", async () => {
    const old = session(); let calls=0; await new LearningCapacityRecovery().recover("actor",{readPlan:()=>plan([old]),readSession:()=>old,retire:async()=>{calls++;}},false); expect(calls).toBe(0);
  });
  it("rejects a foreign explicit retirement", async () => {
    await expect(new LearningCapacityRecovery().retireOwned("other",session(),async()=>{throw new Error("must not invoke");})).rejects.toThrow("Invalid learning capacity owner");
  });
});
