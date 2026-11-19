import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createDevelopmentHmrIframeBridge, registerDevelopmentHmrDocument } from "./reactPreviewDevelopmentHmrIframeBridge";
import { createDevelopmentPreviewBrowserSession } from "./reactPreviewDevelopmentBrowserSession";
import { createDevelopmentPreviewEditorLifecycle } from "./reactPreviewDevelopmentEditorLifecycle";
import { ZOEBUILD_IFRAME_HMR_SCRIPT } from "./reactPreviewDevelopmentNativeIframeHmr";

const doc="/api/build/projects/project_a/preview/preview_123e4567-e89b-42d3-a456-426614174000/development/content/dpg1."+"a".repeat(43)+"/";
const connected=JSON.stringify({type:"connected"});
const update=JSON.stringify({type:"update",updates:[]});
type WireMessage={kind:string;text?:string;nonce?:string;generation?:number};
type WireEvent={data:WireMessage;source?:unknown;origin?:string;ports?:FakePort[]};
class FakePort {
  peer:FakePort|null=null;
  closed=false;
  onmessage:((event:WireEvent)=>void)|null=null;
  constructor(private tasks:(()=>void)[]) {}
  start() {}
  close() {this.closed=true;}
  postMessage(data:WireMessage) {
    const peer=this.peer;
    if(!this.closed && peer) this.tasks.push(()=>{if(!peer.closed)peer.onmessage?.({data});});
  }
}
function harness(run:(f:ReturnType<typeof setup>)=>void) {
  const keys=["window","document","MessageChannel"] as const;
  const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  const f=setup();
  try {run(f);} finally {
    f.bridge.close();f.unregister();
    keys.forEach((key,i)=>{const value=old[i];if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);});
  }
}
function setup() {
  const tasks:(()=>void)[]=[];
  const flush=()=>{let n=0;while(tasks.length){assert.ok(++n<1000);tasks.shift()!();}};
  let parentListener:((event:WireEvent)=>void)|null=null;
  let childListener:((event:WireEvent)=>void)|null=null;
  let nonce=0, bound=0, ready=0, failures=0, reloads=0;
  let revisionReady=true;
  let childPort:FakePort|null=null;
  const parent={postMessage(data:WireMessage){tasks.push(()=>parentListener?.({data,source:child,origin:"null"}));}};
  const child={postMessage(data:WireMessage,_origin:string,ports:FakePort[]){tasks.push(()=>childListener?.({data,source:parent,ports}));}};
  const parentWindow={location:{href:"http://localhost:3004/editor"},addEventListener(_kind:string,fn:(event:WireEvent)=>void){parentListener=fn;},removeEventListener(){parentListener=null;}};
  let documentPath=doc;
  const frame={get src(){return "http://localhost:3004"+documentPath;},set src(value:string){assert.equal(value,"http://localhost:3004"+documentPath);reloads++;},contentWindow:child,isConnected:true,getAttribute:()=>"allow-scripts"};
  const parentDocument={querySelectorAll(){return [frame];}};
  class FakeChannel {port1=new FakePort(tasks);port2=new FakePort(tasks);constructor(){this.port1.peer=this.port2;this.port2.peer=this.port1;childPort=this.port2;}}
  for(const [key,value] of Object.entries({window:parentWindow,document:parentDocument,MessageChannel:FakeChannel}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let unregister=registerDevelopmentHmrDocument(doc,documentPath,frame as unknown as HTMLIFrameElement);
  const bridge=createDevelopmentHmrIframeBridge({documentUrl:doc,onBound:()=>bound++,onClientReady:()=>ready++,onDeliveryFailure:()=>failures++,canDeliverFrames:()=>revisionReady});
  function newDocument(){
    const win={parent,WebSocket:class Native extends EventTarget {},addEventListener(_type:string,fn:(event:WireEvent)=>void){childListener=fn;}};
    runInNewContext(ZOEBUILD_IFRAME_HMR_SCRIPT,{window:win,EventTarget,Event,MessageEvent,DOMException,CloseEvent:class extends Event {},crypto:{getRandomValues(bytes:Uint8Array){bytes.fill(++nonce);return bytes;}},setTimeout(fn:()=>void){tasks.push(fn);return 1;},setInterval(){return 1;},clearInterval(){}});
    return ()=>{
      const socket=Reflect.construct(win.WebSocket,["ws://example.test/","vite-hmr"]) as EventTarget & {readyState:number;close():void};
      const events:string[]=[];
      socket.addEventListener("open",()=>events.push("open"));
      socket.addEventListener("message",event=>events.push(JSON.parse((event as MessageEvent).data).type));
      socket.addEventListener("close",()=>events.push("close"));
      return {socket,events};
    };
  }
  return {bridge,flush,newDocument,unregister:()=>unregister(),navigate:(path:string)=>{unregister();documentPath=path;unregister=registerDevelopmentHmrDocument(doc,path,frame as unknown as HTMLIFrameElement);},announce:(nonce:string)=>parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce}),setRevisionReady:(value:boolean)=>{revisionReady=value;},sendFromIframe:(data:WireMessage)=>childPort?.postMessage(data),counts:()=>({bound,ready,failures,reloads})};
}

describe("Phase 4F5H10F virtual Vite socket handshake",()=>{
  it("does not lose early frames when the port opens before Vite constructs its socket",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);f.bridge.push(update);
    const create=f.newDocument();f.flush();
    assert.equal(f.counts().bound,1);assert.equal(f.counts().ready,0);
    const c=create();assert.equal(c.socket.readyState,0);f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
  }));
  it("holds frames when iframe binds before the real connection opens",()=>harness(f=>{
    f.bridge.push(connected);f.bridge.push(update);
    const create=f.newDocument();const c=create();f.flush();
    assert.deepEqual(c.events,[]);
    f.bridge.setConnected(true);f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
  }));
  it("replays the actual connected frame to a new document without a new Runner socket",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const first=f.newDocument()();f.flush();assert.deepEqual(first.events,["open","connected"]);
    const second=f.newDocument()();f.flush();
    assert.deepEqual(second.events,["open","connected"]);
    f.bridge.push(update);f.flush();assert.deepEqual(second.events,["open","connected","update"]);
    assert.deepEqual(first.events,["open","connected"]);
  }));
  it("binds the exact renderer-registered About document and preserves it during gap reload",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const old=f.newDocument()();f.flush();
    f.navigate(doc+"about");
    const about=f.newDocument()();f.flush();
    f.bridge.push(update);f.flush();
    assert.deepEqual(old.events,["open","connected"]);
    assert.deepEqual(about.events,["open","connected","update"]);
    f.bridge.setConnected(false);f.bridge.setConnected(true);f.bridge.push(connected);f.flush();
    assert.equal(f.counts().reloads,1);
  }));
  it("does not retire an acknowledged document for an unacknowledged stale nonce",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();
    f.announce("ff".repeat(16));f.flush();
    f.bridge.push(update);f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
    assert.equal(f.counts().bound,1);
  }));
  it("does not fabricate a connected frame or release updates before an actual one arrives",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(update);
    const c=f.newDocument()();f.flush();assert.deepEqual(c.events,["open"]);
    f.bridge.push(connected);f.flush();assert.deepEqual(c.events,["open","connected","update"]);
  }));
  it("does not duplicate a connected event on a healthy socket during rotation",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();f.bridge.setConnected(true);f.bridge.push(connected);f.bridge.push(update);f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
  }));
  it("suspends Vite on a real gap and reloads exactly once after the new handshake",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const old=f.newDocument()();f.flush();
    f.bridge.setConnected(false);f.flush();
    assert.deepEqual(old.events,["open","connected"]);
    assert.equal(f.counts().reloads,0);
    f.bridge.setConnected(true);f.flush();
    assert.equal(f.counts().reloads,0);
    f.bridge.push(connected);f.flush();
    assert.equal(f.counts().reloads,1);
    assert.deepEqual(old.events,["open","connected"]);
    const fresh=f.newDocument()();f.flush();
    assert.deepEqual(fresh.events,["open","connected"]);
    f.bridge.push(update);f.flush();
    assert.deepEqual(fresh.events,["open","connected","update"]);
    assert.equal(f.counts().reloads,1);
  }));
  it("ignores a stale client acknowledgement from the previous connection generation",()=>harness(f=>{
    f.bridge.setConnected(true);f.newDocument();f.flush();
    f.setRevisionReady(false);
    f.bridge.setConnected(false);f.bridge.setConnected(true);f.bridge.push(connected);f.bridge.push(update);
    f.sendFromIframe({kind:"client-ready",generation:1});f.flush();
    assert.equal(f.counts().ready,0);
    assert.equal(f.counts().reloads,0);
    f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    assert.equal(f.counts().reloads,1);
    const c=f.newDocument()();f.flush();assert.deepEqual(c.events,["open","connected"]);
  }));
  it("holds Vite updates until the editor confirms the renewed revision grant",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();
    assert.deepEqual(c.events,["open","connected"]);
    f.setRevisionReady(false);
    f.bridge.push(update);f.bridge.push(update);f.flush();
    f.bridge.flushReady();f.flush();
    assert.deepEqual(c.events,["open","connected"]);
    f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    assert.deepEqual(c.events,["open","connected","update","update"]);
    f.bridge.flushReady();f.flush();
    assert.deepEqual(c.events,["open","connected","update","update"]);
  }));
  it("waits for the precise revision grant after loss of fenced frames",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();
    f.setRevisionReady(false);f.bridge.push(update);f.flush();
    f.bridge.setConnected(false);f.bridge.setConnected(true);f.bridge.push(connected);f.flush();
    assert.equal(f.counts().reloads,0);
    f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    assert.equal(f.counts().reloads,1);
    assert.deepEqual(c.events,["open","connected"]);
    const fresh=f.newDocument()();f.flush();
    assert.deepEqual(fresh.events,["open","connected"]);
    assert.equal(f.counts().failures,0);
  }));
  it("does not emit an iframe close event when the parent retires the bridge",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();
    f.bridge.close();f.flush();
    assert.deepEqual(c.events,["open","connected"]);
    assert.equal(f.counts().reloads,0);
  }));
  it("still allows an explicit virtual socket close",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();c.socket.close();f.flush();
    assert.deepEqual(c.events,["open","connected","close"]);
  }));
  it("fails explicitly rather than silently dropping frames on queue overflow",()=>harness(f=>{
    for(let n=0;n<17;n++)f.bridge.push(update);
    assert.equal(f.counts().failures,1);
    f.bridge.push(update);assert.equal(f.counts().failures,1);
  }));
});

it("does not release an HMR event between the real source update and durable grant renewal",async()=>{
  const keys=["window","document","MessageChannel"] as const;
  const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  const f=setup();
  let finishRenew!:(response:Response)=>void;
  let renewRequest=false;
  const id="preview_123e4567-e89b-42d3-a456-426614174000";
  const json=(value:unknown)=>new Response(JSON.stringify(value),{
    headers:{"content-type":"application/json"}});
  const controller=createDevelopmentPreviewBrowserSession({
    buildProjectId:"project_a",fetchClient:async(url,init)=>{
      const {sourceVersion}=JSON.parse(String(init.body));
      if(url.endsWith("/start"))return json({ok:true,previewId:id,sourceVersion});
      if(url.endsWith("/read-access"))return json({ok:true,sourceVersion,documentUrl:doc,basePath:doc});
      if(url.endsWith("/update"))return json({ok:true,action:"updated",sourceVersion});
      if(url.endsWith("/renew-access")){
        renewRequest=true;
        return new Promise<Response>(resolve=>{finishRenew=resolve;});
      }
      throw new Error("Unexpected control request");
    }});
  const lifecycle=createDevelopmentPreviewEditorLifecycle({
    controller,onWaiting:()=>{},onFailure:()=>{throw new Error("Unexpected failure");},
    onDocument:()=>{f.setRevisionReady(lifecycle.readyDocument()!==null);f.bridge.flushReady();}
  });
  async function settleUntil(condition:()=>boolean){
    for(let i=0;i<100&&!condition();i++)await Promise.resolve();
    assert.ok(condition(),"Control request did not settle");
  }
  try{
    lifecycle.savedRevision(9,true);
    await settleUntil(()=>lifecycle.readyDocument()?.sourceVersion===9);
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument()();f.flush();
    assert.deepEqual(c.events,["open","connected"]);

    lifecycle.savedRevision(9,false);
    f.setRevisionReady(lifecycle.readyDocument()!==null);
    lifecycle.savedRevision(10,true);
    await settleUntil(()=>renewRequest);
    assert.equal(controller.snapshot(),null);
    assert.equal(lifecycle.readyDocument(),null);
    f.bridge.push(update);f.flush();
    assert.deepEqual(c.events,["open","connected"]);

    finishRenew(json({ok:true,sourceVersion:10}));
    await settleUntil(()=>lifecycle.readyDocument()?.sourceVersion===10);
    f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
    assert.equal(lifecycle.readyDocument()?.documentUrl,doc);
  }finally{
    lifecycle.dispose();f.bridge.close();f.unregister();
    keys.forEach((key,i)=>{const value=old[i];if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);});
  }
});
