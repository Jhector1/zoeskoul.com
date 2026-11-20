import {describe,expect,it,vi} from "vitest";
import {createDevelopmentPreviewEditorLifecycle} from "./reactPreviewDevelopmentEditorLifecycle";
import type {createDevelopmentPreviewBrowserSession} from "./reactPreviewDevelopmentBrowserSession";

type Session = ReturnType<typeof createDevelopmentPreviewBrowserSession>;
const id = "preview_11111111-1111-4111-8111-111111111111";
const document = (version:number) => ({
  previewId:id,sourceVersion:version,documentUrl:`/development/scope/${version}/`,grantIssuedAt:0,
});
function make() {
  let snapshot:ReturnType<Session["snapshot"]>=null;
  let due=false;
  const controller={
    start:vi.fn(async (v:number)=>{snapshot=document(v);return snapshot;}),
    restart:vi.fn(async (v:number)=>{snapshot=document(v);return snapshot;}),
    update:vi.fn(async (v:number)=>{snapshot=document(v);return snapshot;}),
    renew:vi.fn(async ()=>{if(!snapshot)throw Error("missing");return snapshot;}),
    snapshot:vi.fn(()=>snapshot),
    renewalDue:vi.fn(()=>due),
    close:vi.fn(()=>{snapshot=null;}),
  } satisfies Session;
  const onDocument=vi.fn(),onFailure=vi.fn(),onWaiting=vi.fn();
  const lifecycle=createDevelopmentPreviewEditorLifecycle({controller,onDocument,onFailure,onWaiting,
    recoveryDelay:async()=>undefined});
  return {controller,lifecycle,onDocument,onFailure,onWaiting,setDue:(v:boolean)=>{due=v;},setSnapshot:(v:ReturnType<typeof document>)=>{snapshot=v;}};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

describe("Phase 4E3B saved-revision editor integration",()=>{
  it("starts only saved source and sends one consecutive update",async()=>{
    const f=make();
    f.lifecycle.savedRevision(7,false);await flush();
    expect(f.controller.start).not.toHaveBeenCalled();
    f.lifecycle.savedRevision(7,true);await flush();
    expect(f.controller.start).toHaveBeenCalledWith(7);
    f.lifecycle.savedRevision(8,true);await flush();
    expect(f.controller.update).toHaveBeenCalledWith(8);
    expect(f.onDocument).toHaveBeenLastCalledWith(expect.objectContaining({sourceVersion:8,previewId:id}));
    f.lifecycle.dispose();await flush();
    expect(f.controller.close).toHaveBeenCalledOnce();
  });
  it("fences the prior revision through update and grant confirmation",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    expect(f.lifecycle.readyDocument()?.sourceVersion).toBe(7);
    let finish!:(v:ReturnType<typeof document>)=>void;
    f.controller.update.mockImplementationOnce(()=>new Promise(resolve=>{
      finish=v=>{f.setSnapshot(v);resolve(v);};
    }));
    f.lifecycle.savedRevision(7,false);
    expect(f.lifecycle.readyDocument()).toBeNull();
    f.lifecycle.savedRevision(8,true);
    expect(f.lifecycle.readyDocument()).toBeNull();
    // Even a controller snapshot for N+1 cannot release frames before publish.
    f.setSnapshot(document(8));
    expect(f.lifecycle.readyDocument()).toBeNull();
    f.onDocument.mockImplementationOnce(()=>{
      expect(f.lifecycle.readyDocument()?.sourceVersion).toBe(8);
    });
    finish(document(8));await flush();
    expect(f.lifecycle.readyDocument()?.sourceVersion).toBe(8);
    f.lifecycle.dispose();
    expect(f.lifecycle.readyDocument()).toBeNull();
  });
  it("updates a skipped revision using the existing authoritative lease",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    f.lifecycle.savedRevision(9,true);await flush();
    expect(f.controller.update).toHaveBeenCalledExactlyOnceWith(9);
    expect(f.controller.restart).not.toHaveBeenCalled();
    expect(f.onFailure).not.toHaveBeenCalled();
    f.lifecycle.dispose();
  });
  it("silences an outdated document response while a newer saved revision waits",async()=>{
    let complete!: (v:ReturnType<typeof document>)=>void;
    const f=make();
    f.controller.start.mockImplementationOnce((_version:number)=>new Promise(resolve=>{complete=(v)=>{f.setSnapshot(v);resolve(v);};}));
    f.lifecycle.savedRevision(7,true);
    f.lifecycle.savedRevision(8,true);
    complete(document(7));await flush();
    expect(f.controller.update).toHaveBeenCalledWith(8);
    expect(f.onDocument).toHaveBeenCalledTimes(1);
    expect(f.onDocument).toHaveBeenLastCalledWith(expect.objectContaining({sourceVersion:8}));
    f.lifecycle.dispose();
  });
  it("exposes explicit serialized lifecycle transitions",async()=>{
    let finish!:(value:ReturnType<typeof document>)=>void;
    const f=make();
    f.controller.start.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    f.lifecycle.savedRevision(7,false);
    expect(f.lifecycle.snapshot()).toMatchObject({phase:"waiting-for-save",selectedVersion:7,
      selectedReady:false});
    f.lifecycle.savedRevision(7,true);
    expect(f.lifecycle.snapshot()).toMatchObject({phase:"starting",running:true});
    f.setSnapshot(document(7));finish(document(7));await flush();
    expect(f.lifecycle.snapshot()).toMatchObject({phase:"ready",running:false,pending:null});
    f.lifecycle.dispose();
    expect(f.lifecycle.snapshot().phase).toBe("closed");
  });
  it("renews a due grant but never renews during a dirty or stale source",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    f.setDue(true);await f.lifecycle.renewIfDue();
    expect(f.controller.renew).toHaveBeenCalledTimes(1);
    f.lifecycle.savedRevision(8,false);
    await f.lifecycle.renewIfDue();
    expect(f.controller.renew).toHaveBeenCalledTimes(1);
    expect(f.onWaiting).toHaveBeenCalled();
    f.lifecycle.dispose();
  });
  it("uses bounded authoritative recovery after a transient update failure",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    f.controller.update.mockRejectedValueOnce(new Error("authority unavailable"));
    f.lifecycle.savedRevision(8,true);await flush();
    await flush();await flush();
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.controller.update).toHaveBeenCalledTimes(1);
    expect(f.controller.restart).toHaveBeenCalledWith(8);
    f.lifecycle.dispose();
  });
  it("retries a proven pre-write rejection without restart or lease replacement",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    // Use the actual prototype so the lifecycle's typed safety gate is tested.
    const {DevelopmentBrowserSessionError}=await import("./reactPreviewDevelopmentBrowserSession");
    f.controller.update.mockRejectedValueOnce(
      new DevelopmentBrowserSessionError("RETRYABLE_UPDATE","not applied",503));
    f.lifecycle.savedRevision(8,true);
    for(let i=0;i<8;i++)await flush();
    expect(f.controller.update).toHaveBeenCalledTimes(2);
    expect(f.controller.restart).not.toHaveBeenCalled();
    expect(f.onDocument).toHaveBeenLastCalledWith(expect.objectContaining({sourceVersion:8}));
    f.lifecycle.dispose();
  });
  it("does not replay an older rejected revision when a newer saved revision arrives",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    const {DevelopmentBrowserSessionError}=await import("./reactPreviewDevelopmentBrowserSession");
    let reject!:(error:Error)=>void;
    f.controller.update.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    f.lifecycle.savedRevision(8,true);
    f.lifecycle.savedRevision(9,true);
    reject(new DevelopmentBrowserSessionError("RETRYABLE_UPDATE","not applied",503));
    for(let i=0;i<8;i++)await flush();
    expect(f.controller.update).toHaveBeenCalledTimes(2);
    expect(f.controller.update).toHaveBeenLastCalledWith(9);
    expect(f.controller.restart).not.toHaveBeenCalled();
    expect(f.onDocument).toHaveBeenLastCalledWith(expect.objectContaining({sourceVersion:9}));
    f.lifecycle.dispose();
  });
  it("fails closed after the bounded recovery budget",async()=>{
    const f=make();
    f.controller.start.mockRejectedValue(new Error("transport unavailable"));
    f.controller.restart.mockRejectedValue(new Error("transport unavailable"));
    f.lifecycle.savedRevision(7,true);
    for(let i=0;i<20;i++)await flush();
    expect(f.controller.start).toHaveBeenCalledOnce();
    expect(f.controller.restart).toHaveBeenCalledTimes(3);
    expect(f.onFailure).toHaveBeenCalledOnce();
    f.lifecycle.dispose();
  });
  it("ignores a late response after disposal without destroying the Runner lease",async()=>{
    const f=make();f.lifecycle.savedRevision(7,true);await flush();
    let complete!:(v:ReturnType<typeof document>)=>void;
    f.controller.update.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    f.lifecycle.savedRevision(8,true);
    f.lifecycle.dispose();complete(document(8));await flush();
    expect(f.onDocument).toHaveBeenCalledTimes(1);
    expect(f.controller.close).toHaveBeenCalledOnce();
  });
});
