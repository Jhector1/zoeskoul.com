import {describe,expect,it,vi} from "vitest";
import {
  createDevelopmentHmrRotationCoordinator,
  createDevelopmentRecoveryCircuit,
  createDevelopmentRecoveryHandoff,
} from "./reactPreviewDevelopmentRecoveryPolicy";

const socket=()=>({close:vi.fn()});

describe("development preview recovery policy",()=>{
  it("keeps a bounded circuit across controller remounts",()=>{
    const circuit=createDevelopmentRecoveryCircuit({maxFailures:3,baseDelayMs:100,maxDelayMs:500});
    circuit.bindProject("project");
    expect(circuit.fail("project")).toEqual({attempt:1,retry:true,delayMs:100});
    // Rebinding the same project models an effect/controller remount.
    circuit.bindProject("project");
    expect(circuit.fail("project")).toEqual({attempt:2,retry:true,delayMs:200});
    expect(circuit.fail("project")).toEqual({attempt:3,retry:false,delayMs:null});
    expect(circuit.fail("project")).toEqual({attempt:3,retry:false,delayMs:null});
    expect(circuit.snapshot()).toMatchObject({failures:3,circuitOpen:true});
  });
  it("resets only for meaningful recovery or a different project",()=>{
    const circuit=createDevelopmentRecoveryCircuit({maxFailures:2,baseDelayMs:100,maxDelayMs:200});
    circuit.bindProject("one");circuit.fail("one");
    expect(circuit.meaningfulRecovery("other")).toBe(false);
    expect(circuit.snapshot().failures).toBe(1);
    expect(circuit.meaningfulRecovery("one")).toBe(true);
    expect(circuit.snapshot().failures).toBe(0);
    circuit.fail("one");circuit.bindProject("two");
    expect(circuit.snapshot()).toMatchObject({projectId:"two",failures:0,circuitOpen:false});
  });
});

describe("development HMR socket rotation",()=>{
  const coordinator=()=>createDevelopmentHmrRotationCoordinator<ReturnType<typeof socket>>({
    maxFailures:2,baseDelayMs:25,maxDelayMs:100,
  });
  it("ignores a retired socket's late events without closing its replacement",()=>{
    const c=coordinator(),first=socket(),second=socket();
    const one=c.beginAttempt()!;expect(c.promote(one,first).accepted).toBe(true);
    const two=c.beginAttempt()!;expect(c.promote(two,second)).toEqual({accepted:true,retired:first});
    const late=c.recordFailure(one,first);
    expect(late).toMatchObject({handled:false,retainedActive:true});
    expect(second.close).not.toHaveBeenCalled();
    expect(c.meaningfulRecovery(two,second)).toBe(true);
  });
  it("retains a healthy socket when its rotation candidate fails",()=>{
    const c=coordinator(),active=socket(),candidate=socket();
    const one=c.beginAttempt()!;c.promote(one,active);
    const two=c.beginAttempt()!;
    expect(c.recordFailure(two,candidate)).toMatchObject({handled:false,retry:false,retainedActive:true});
    expect(c.meaningfulRecovery(one,active)).toBe(true);
    expect(active.close).not.toHaveBeenCalled();
  });
  it("bounds reconnects and resets only after active meaningful recovery",()=>{
    const c=coordinator();
    for(const expected of [
      {attempt:1,retry:true,delayMs:25},
      {attempt:2,retry:true,delayMs:50},
      {attempt:3,retry:false,delayMs:null},
    ]) {
      const candidate=socket(),id=c.beginAttempt()!;
      expect(c.recordFailure(id,candidate)).toMatchObject({handled:true,...expected});
    }
    const recovered=socket(),id=c.beginAttempt()!;c.promote(id,recovered);
    expect(c.meaningfulRecovery(id,recovered)).toBe(true);
    const next=socket(),nextId=c.beginAttempt()!;
    expect(c.recordFailure(nextId,next)).toMatchObject({attempt:0,handled:false,retainedActive:true});
  });
});


describe("exclusive development recovery handoff",()=>{
  it("coalesces lifecycle and socket failures from one controller",()=>{
    const circuit=createDevelopmentRecoveryCircuit({maxFailures:3,baseDelayMs:100,maxDelayMs:500});
    const decide=vi.fn(()=>circuit.fail("project"));
    const h=createDevelopmentRecoveryHandoff(decide);
    expect(h.request()).toEqual({kind:"development",delayMs:100});
    expect(h.request()).toBeNull();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(circuit.snapshot().failures).toBe(1);
  });
  it("stays native until terminal fallback, with no retry delay after fallback",()=>{
    const circuit=createDevelopmentRecoveryCircuit({maxFailures:3,baseDelayMs:100,maxDelayMs:500});
    const next=()=>createDevelopmentRecoveryHandoff(()=>circuit.fail("project"));
    expect(next().request()).toEqual({kind:"development",delayMs:100});
    expect(next().request()).toEqual({kind:"development",delayMs:200});
    const last=next();
    expect(last.request()).toEqual({kind:"immutable"});
    expect(last.request()).toBeNull();
    expect(circuit.snapshot().circuitOpen).toBe(true);
  });
  it("ignores retired controller callbacks without charging the new circuit",()=>{
    const decide=vi.fn(()=>({attempt:1,retry:true,delayMs:100}));
    const retired=createDevelopmentRecoveryHandoff(decide);retired.close();
    expect(retired.request()).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });
});
