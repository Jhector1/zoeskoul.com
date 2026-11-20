import {describe, expect, it, vi} from "vitest";
import {
  openOwnedTanstackDevelopmentHmrRelay,
  PrivateHmrRelayError,
} from "./tanstackPreviewHmrDockerRelay.js";

const BASE="/api/build/projects/project_test/preview/preview_abcd0123/content/0123456789abcdef0123456789abcdef/";
const identity={ownerKey:"actor",previewId:"preview_abcd0123",buildProjectId:"project_test",sourceVersion:7};

function fixture() {
  let version=7;
  let closing=false;
  let pending=false;
  const onText=vi.fn();
  const onClose=vi.fn();
  const sendText=vi.fn();
  const close=vi.fn();
  let upstream: (text:string)=>void=()=>{};
  let end: ()=>void=()=>{};
  const registry={get:vi.fn((id:string)=>id===identity.previewId?{mode:"development",ownerKey:identity.ownerKey,previewId:id,buildProjectId:identity.buildProjectId,containerId:"a".repeat(64),basePath:BASE,identity:{fingerprint:"fp"},sourceVersion:version}:null),
    developmentUpdatePending:vi.fn(()=>pending),
    assertDevelopmentReadOpen:vi.fn((expected:typeof identity)=>{
    if (closing || pending || expected.ownerKey!==identity.ownerKey || expected.buildProjectId!==identity.buildProjectId || expected.sourceVersion!==version || expected.previewId!==identity.previewId)
      throw Error("Preview not found.");
    return {containerId:"a".repeat(64),basePath:BASE,identity:{fingerprint:"fp"},sourceVersion:version};
  })};
  const openWorker=vi.fn(async (_:string,__:string,handleText:(text:string)=>void,handleClose:()=>void)=>{
    upstream=handleText;end=handleClose;
    return {sendText,close};
  });
  return {onText,onClose,sendText,close,registry,openWorker,upstream:(text:string)=>upstream(text),end:()=>end(),setVersion:(value:number)=>{version=value;},setPending:(v:boolean)=>{pending=v;},stop:()=>{closing=true;}};
}

describe("Phase 4E3C2 private Docker HMR relay fence (no public route)",()=>{
  it("admits only a matching development lease and forwards bounded messages",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    expect(f.openWorker).toHaveBeenCalledWith("a".repeat(64),BASE,expect.any(Function),expect.any(Function));
    relay.sendText('{"type":"ping"}');
    expect(f.sendText).toHaveBeenCalledWith('{"type":"ping"}');
    f.upstream('{"type":"connected"}');
    expect(f.onText).toHaveBeenCalledWith('{"type":"connected"}');
    relay.close();
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.onClose).toHaveBeenCalledTimes(1);
    expect(()=>relay.sendText("again")).toThrow(PrivateHmrRelayError);
  });
  it("keeps the same socket across one committed source revision",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.setPending(true);
    f.upstream('{"type":"update","revision":8}');
    expect(f.onText).not.toHaveBeenCalled();
    f.setVersion(8);f.setPending(false);
    f.upstream('{"type":"update","revision":8,"final":true}');
    expect(f.onText).toHaveBeenCalledTimes(2);
    expect(f.close).not.toHaveBeenCalled();
    relay.sendText('{"type":"ping"}');
    expect(f.sendText).toHaveBeenCalledOnce();
    relay.close();
  });
  it("keeps the same socket across a committed revision gap and fences regression",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.setPending(true);f.upstream('{"type":"update"}');
    expect(f.onText).not.toHaveBeenCalled();
    f.setVersion(12);f.setPending(false);
    relay.sendText('{"type":"ping"}');
    expect(f.onText).toHaveBeenCalledOnce();
    expect(f.close).not.toHaveBeenCalled();
    f.onText.mockClear();f.setVersion(11);
    expect(()=>relay.sendText("late")).toThrow(PrivateHmrRelayError);
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.onText).not.toHaveBeenCalled();
  });
  it("stops on close intent and rejects stale upstream output",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.stop();f.upstream('{"type":"update"}');
    expect(f.onText).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
    expect(()=>relay.sendText("x")).toThrow();
  });
  it("rewrites the exact private Vite base to an inert marker without exposing capability",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.upstream(JSON.stringify({type:"update",path:BASE+"src/app.tsx"}));
    expect(f.onText).toHaveBeenCalledTimes(1);
    const forwarded=f.onText.mock.calls[0][0];
    expect(forwarded).toContain("/__zoebuild_dev_preview_public_base__/src/app.tsx");
    expect(forwarded).not.toContain("0123456789abcdef0123456789abcdef");
    expect(f.close).not.toHaveBeenCalled();
    relay.close();
  });
  it("still quarantines private secrets outside the exact known base",async()=>{
    const f=fixture();
    await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.upstream(JSON.stringify({type:"error",message:"secret=0123456789abcdef0123456789abcdef"}));
    expect(f.onText).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("fails on mismatched owner before creating Docker exec",async()=>{
    const f=fixture();
    await expect(openOwnedTanstackDevelopmentHmrRelay({identity:{...identity,ownerKey:"another"},onText:f.onText},f as never)).rejects.toThrow();
    expect(f.openWorker).not.toHaveBeenCalled();
  });
  it("rejects oversized client messages and closes the private stream",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    expect(()=>relay.sendText("x".repeat(65_537))).toThrow(PrivateHmrRelayError);
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("closes when Docker reports stream shutdown",async()=>{
    const f=fixture();
    const relay=await openOwnedTanstackDevelopmentHmrRelay({identity,onText:f.onText,onClose:f.onClose},f as never);
    f.end();
    expect(f.onClose).toHaveBeenCalledOnce();
    expect(()=>relay.sendText("x")).toThrow();
  });
});
