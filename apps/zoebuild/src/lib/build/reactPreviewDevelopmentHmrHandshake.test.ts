import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createDevelopmentHmrIframeBridge, registerDevelopmentHmrDocument, subscribeDevelopmentNavigation, sendDevelopmentNavigation, type DevelopmentNavigationState } from "./reactPreviewDevelopmentHmrIframeBridge";
import { createDevelopmentPreviewBrowserSession } from "./reactPreviewDevelopmentBrowserSession";
import { createDevelopmentPreviewEditorLifecycle } from "./reactPreviewDevelopmentEditorLifecycle";
import { injectNativeIframeHmrBootstrap, ZOEBUILD_IFRAME_HMR_SCRIPT } from "./reactPreviewDevelopmentNativeIframeHmr";

const doc="/api/build/projects/project_a/preview/preview_123e4567-e89b-42d3-a456-426614174000/development/content/dpg1."+"a".repeat(43)+"/";
const connected=JSON.stringify({type:"connected"});
const update=JSON.stringify({type:"update",updates:[]});
type WireMessage={kind:string;text?:string;nonce?:string;generation?:number;route?:string;canGoBack?:boolean;canGoForward?:boolean;failed?:boolean};
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
function harness(run:(f:ReturnType<typeof setup>)=>void,versioned=false,navigation=false,canonicalRoot=false) {
  const keys=["window","document","MessageChannel"] as const;
  const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  const f=setup(versioned,navigation,canonicalRoot);
  try {run(f);} finally {
    f.bridge.close();f.unregister();
    keys.forEach((key,i)=>{const value=old[i];if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);});
  }
}
function setup(versioned=false,navigation=false,canonicalRoot=false) {
  const tasks:(()=>void)[]=[];
  const flush=()=>{let n=0;while(tasks.length){assert.ok(++n<1000);tasks.shift()!();}};
  let parentListener:((event:WireEvent)=>void)|null=null;
  let childListener:((event:WireEvent)=>void)|null=null;
  let nonce=0, bound=0, ready=0, failures=0, reloads=0;
  const connectionStates:string[]=[];
  let revisionReady=true;
  let revision=9;
  let childLoad:(()=>void)|undefined;
  let childPort:FakePort|null=null;
  let websiteNavigate:(route:string)=>void=()=>undefined;
  let routerNotifications=0;
  const parent={postMessage(data:WireMessage){tasks.push(()=>parentListener?.({data,source:child,origin:"null"}));}};
  const child={postMessage(data:WireMessage,_origin:string,ports:FakePort[]){tasks.push(()=>childListener?.({data,source:parent,ports}));}};
  const parentWindow={location:{href:"http://localhost:3004/editor"},addEventListener(_kind:string,fn:(event:WireEvent)=>void){parentListener=fn;},removeEventListener(){parentListener=null;}};
  let documentPath=doc;
  const frame={get src(){return "http://localhost:3004"+documentPath;},set src(value:string){assert.equal(value,"http://localhost:3004"+documentPath);reloads++;},contentWindow:child,isConnected:true,getAttribute:()=>"allow-scripts"};
  const parentDocument={querySelectorAll(){return [frame];}};
  class FakeChannel {port1=new FakePort(tasks);port2=new FakePort(tasks);constructor(){this.port1.peer=this.port2;this.port2.peer=this.port1;childPort=this.port2;}}
  for(const [key,value] of Object.entries({window:parentWindow,document:parentDocument,MessageChannel:FakeChannel}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let unregister=registerDevelopmentHmrDocument(doc,documentPath,frame as unknown as HTMLIFrameElement);
  const bridge=createDevelopmentHmrIframeBridge({documentUrl:doc,onConnectionState:state=>connectionStates.push(state),onBound:()=>bound++,onClientReady:()=>ready++,onDeliveryFailure:()=>failures++,canDeliverFrames:()=>revisionReady,...(versioned?{getReadySourceVersion:()=>revisionReady?revision:null}:{})});
  function newDocument(sourceVersion=revision){
    childLoad=undefined;
    const listeners=new Map<string,(()=>void)[]>();
    const location=new URL("http://localhost:3004"+(canonicalRoot&&documentPath===doc?doc.slice(0,-1):documentPath));
    let cursor=0;
    const entries=[{url:location.href,state:{__TSR_index:0}}];
    function event(name:string){for(const fn of listeners.get(name)??[])fn();}
    const history={get state(){return entries[cursor]!.state;},pushState(state:{__TSR_index:number},_unused:string,url:string){
      location.href=new URL(url,location.href).href;entries.splice(cursor+1);entries.push({url:location.href,state});cursor++;
    },replaceState(state:{__TSR_index:number},_unused:string,url:string){location.href=new URL(url,location.href).href;entries[cursor]={url:location.href,state};},
    back(){if(cursor>0){cursor--;location.href=entries[cursor]!.url;event("popstate");}},forward(){if(cursor<entries.length-1){cursor++;location.href=entries[cursor]!.url;event("popstate");}}};
    const win={parent,WebSocket:class Native extends EventTarget {},...(navigation?{location,history,dispatchEvent(e:Event){event(e.type);return true;}}:{}),addEventListener(type:string,fn:(event:WireEvent)=>void){if(type==="load")childLoad=()=>fn({data:{kind:"load"}});else if(type==="message")childListener=fn;else {const list=listeners.get(type)??[];list.push(()=>fn({data:{kind:type}}));listeners.set(type,list);}}};
    const script=versioned?injectNativeIframeHmrBootstrap("<head></head>",undefined,sourceVersion).split("<script>")[1]!.split("</script>")[0]!:ZOEBUILD_IFRAME_HMR_SCRIPT;
    runInNewContext(script,{window:win,EventTarget,Event,MessageEvent,PopStateEvent:class extends Event {},DOMException,CloseEvent:class extends Event {},crypto:{getRandomValues(bytes:Uint8Array){bytes.fill(++nonce);return bytes;}},setTimeout(fn:()=>void){tasks.push(fn);return 1;},setInterval(){return 1;},clearInterval(){}});
    if(navigation){
      // Model TanStack's external-history notification: it wraps pushState
      // after the trusted bootstrap and notifies subscribers exactly once.
      const push=history.pushState;
      history.pushState=function(...args){push.apply(this,args);routerNotifications++;};
      listeners.set("popstate",[...(listeners.get("popstate")??[]),()=>routerNotifications++]);
      websiteNavigate=route=>history.pushState({__TSR_index:cursor+1},"",canonicalRoot&&route==="/"?doc.slice(0,-1):doc+route.slice(1));
    }
    return ()=>{
      const socket=Reflect.construct(win.WebSocket,["ws://example.test/","vite-hmr"]) as EventTarget & {readyState:number;close():void};
      const events:string[]=[];
      socket.addEventListener("open",()=>events.push("open"));
      socket.addEventListener("message",event=>events.push(JSON.parse((event as MessageEvent).data).type));
      socket.addEventListener("close",()=>events.push("close"));
      return {socket,events};
    };
  }
  return {bridge,flush,newDocument,connectionStates,websiteNavigate:(route:string)=>websiteNavigate(route),routerNotifications:()=>routerNotifications,unregister:()=>unregister(),navigate:(path:string)=>{unregister();documentPath=path;unregister=registerDevelopmentHmrDocument(doc,path,frame as unknown as HTMLIFrameElement);},announce:(nonce:string)=>parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce}),setRevisionReady:(value:boolean)=>{revisionReady=value;},setRevision:(value:number)=>{revision=value;},load:()=>childLoad?.(),sendFromIframe:(data:WireMessage)=>childPort?.postMessage(data),counts:()=>({bound,ready,failures,reloads})};
}

describe("Phase 4F5H10F virtual Vite socket handshake",()=>{
  it("reports live only after the exact versioned document and Vite handshake, then clears on navigation and disconnect",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);f.newDocument()();f.flush();
    assert.notEqual(f.connectionStates.at(-1),"live");
    f.load();f.flush();assert.equal(f.connectionStates.at(-1),"live");
    f.navigate(doc+"about");assert.equal(f.connectionStates.at(-1),"reconnecting");
    f.newDocument()();f.flush();assert.notEqual(f.connectionStates.at(-1),"live");
    f.load();f.flush();assert.equal(f.connectionStates.at(-1),"live");
    f.bridge.setConnected(false);assert.equal(f.connectionStates.at(-1),"reconnecting");
  },true));
  it("navigates on the existing document port, syncs website links and goes back and forward without reload",()=>harness(f=>{
    const states:(DevelopmentNavigationState|null)[]=[];
    const off=subscribeDevelopmentNavigation(doc,state=>states.push(state));
    try{
      f.bridge.setConnected(true);f.bridge.push(connected);const client=f.newDocument()();f.flush();
      assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route:"/about"}),false);
      f.load();f.flush();assert.equal(states.at(-1)?.route,"/");
      assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route:"/about"}),true);f.flush();
      assert.equal(states.at(-1)?.route,"/about");assert.equal(states.at(-1)?.canGoBack,true);
      assert.equal(f.routerNotifications(),1);
      f.websiteNavigate("/");f.flush();assert.equal(states.at(-1)?.route,"/");
      assert.equal(sendDevelopmentNavigation(doc,{action:"back"}),true);f.flush();
      assert.equal(states.at(-1)?.route,"/about");assert.equal(states.at(-1)?.canGoForward,true);
      assert.equal(sendDevelopmentNavigation(doc,{action:"forward"}),true);f.flush();assert.equal(states.at(-1)?.route,"/");
      f.bridge.push(update);f.flush();assert.deepEqual(client.events,["open","connected","update"]);
      assert.equal(f.counts().bound,1);assert.equal(f.counts().reloads,0);assert.equal(f.connectionStates.at(-1),"live");
    }finally{off();}
  },true,true));
  it("initializes navigation after the registered root redirects to its slashless canonical URL",()=>harness(f=>{
    const states:(DevelopmentNavigationState|null)[]=[];
    const off=subscribeDevelopmentNavigation(doc,state=>states.push(state));
    try{
      f.bridge.setConnected(true);f.bridge.push(connected);f.newDocument()();f.flush();f.load();f.flush();
      assert.equal(f.connectionStates.at(-1),"live");assert.equal(states.at(-1)?.route,"/");
      assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route:"/about"}),true);f.flush();
      assert.equal(states.at(-1)?.route,"/about");
      f.websiteNavigate("/");f.flush();assert.equal(states.at(-1)?.route,"/");
      assert.equal(sendDevelopmentNavigation(doc,{action:"back"}),true);f.flush();assert.equal(states.at(-1)?.route,"/about");
      assert.equal(sendDevelopmentNavigation(doc,{action:"forward"}),true);f.flush();assert.equal(states.at(-1)?.route,"/");
      assert.equal(f.counts().reloads,0);assert.equal(f.counts().bound,1);
    }finally{off();}
  },true,true,true));
  it("rejects unsafe navigation and fences commands on revision transition or retired port",()=>harness(f=>{
    const states:(DevelopmentNavigationState|null)[]=[];
    const off=subscribeDevelopmentNavigation(doc,state=>states.push(state));
    try{
      f.bridge.setConnected(true);f.bridge.push(connected);f.newDocument()();f.flush();f.load();f.flush();
      for(const route of ["//external.test","/../x","/a%2fb","https://external.test/","/a?token=x","/a\\b"])
        assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route}),false);
      f.sendFromIframe({kind:"navigation-state",route:"//external.test",canGoBack:true,canGoForward:true,failed:false});f.flush();assert.equal(states.at(-1)?.route,"/");
      f.setRevisionReady(false);f.bridge.flushReady();assert.equal(states.at(-1),null);
      assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route:"/about"}),false);
      f.setRevisionReady(true);f.bridge.flushReady();f.bridge.setConnected(false);
      assert.equal(sendDevelopmentNavigation(doc,{action:"navigate",route:"/about"}),false);
      f.bridge.close();assert.equal(states.at(-1),null);assert.equal(f.counts().reloads,0);
    }finally{off();}
  },true,true));
  it("does not report live without a real connected frame or a current revision grant",()=>harness(f=>{
    f.bridge.setConnected(true);f.newDocument()();f.flush();f.load();f.flush();
    assert.notEqual(f.connectionStates.at(-1),"live");
    f.bridge.push(connected);f.flush();assert.equal(f.connectionStates.at(-1),"live");
    f.setRevisionReady(false);f.bridge.flushReady();assert.equal(f.connectionStates.at(-1),"reconnecting");
    f.setRevisionReady(true);f.bridge.flushReady();assert.equal(f.connectionStates.at(-1),"live");
  },true));
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


describe("H10W2D versioned initial document recovery",()=>{
  it("holds edit frames during boot but allows the native connected handshake",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument(9)();f.flush();
    f.bridge.push(update);f.flush();
    assert.deepEqual(c.events,["open","connected"]);
    f.load();f.flush();
    assert.deepEqual(c.events,["open","connected","update"]);
    assert.equal(f.counts().reloads,0);
  },true));
  it("recovers a mixed boot only once the exact newer grant is ready",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument(9)();f.flush();
    f.setRevisionReady(false);f.setRevision(10);f.bridge.push(update);
    f.load();f.flush();assert.equal(f.counts().reloads,0);
    f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    assert.equal(f.counts().reloads,1);
    assert.deepEqual(c.events,["open","connected"]);
    const fresh=f.newDocument(10)();f.flush();f.load();f.flush();
    f.bridge.push(update);f.flush();assert.deepEqual(fresh.events,["open","connected","update"]);
    assert.equal(f.counts().reloads,1);
  },true));
  it("recovers when the old SSR document binds after a newer grant is ready",()=>harness(f=>{
    f.setRevision(10);f.bridge.setConnected(true);f.bridge.push(connected);
    f.navigate(doc+"about");f.newDocument(9)();f.flush();
    assert.equal(f.counts().reloads,1);
    const fresh=f.newDocument(10)();f.flush();f.load();f.flush();
    assert.deepEqual(fresh.events,["open","connected"]);
    assert.equal(f.counts().reloads,1);
  },true));
  it("preserves the same iframe and ordinary HMR for successive settled edits",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument(9)();f.flush();f.load();f.flush();
    for(const version of [10,11,12]){
      f.setRevisionReady(false);f.setRevision(version);f.bridge.push(update);f.flush();
      f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    }
    assert.deepEqual(c.events,["open","connected","update","update","update"]);
    assert.equal(f.counts().reloads,0);
  },true));
  it("retains a load signal that happens before the port is bound",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);
    const c=f.newDocument(9)();f.load();f.flush();
    f.bridge.push(update);f.flush();assert.deepEqual(c.events,["open","connected","update"]);
    assert.equal(f.counts().reloads,0);
  },true));
  it("does not reload for a temporary fence that returns to the same document revision",()=>harness(f=>{
    f.bridge.setConnected(true);f.bridge.push(connected);const c=f.newDocument(9)();f.flush();
    f.setRevisionReady(false);f.load();f.flush();
    f.setRevisionReady(true);f.bridge.flushReady();f.flush();
    assert.equal(f.counts().reloads,0);assert.deepEqual(c.events,["open","connected"]);
  },true));
});
