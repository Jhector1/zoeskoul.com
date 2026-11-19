import { afterEach,describe,expect,it,vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createDevelopmentHmrIframeBridge, registerDevelopmentHmrDocument } from "./reactPreviewDevelopmentHmrIframeBridge";
import { injectNativeIframeHmrBootstrap } from "./reactPreviewDevelopmentNativeIframeHmr";
import { APPLICATION_RPC_ACCEPT } from "./reactPreviewDevelopmentApplicationProtocol";
const doc="/api/build/projects/project_a/preview/preview_123e4567-e89b-42d3-a456-426614174000/development/content/dpg1."+"a".repeat(43)+"/";
const origin="https://editor.example.test";
const opts={method:"GET",headers:{accept:APPLICATION_RPC_ACCEPT,"x-tsr-serverfn":"true"}};
function setup(enabled=true,childOrigin="null",registered=true) {
  type Message={data:any,source?:unknown,origin?:string,ports?:Port[]};
  class Port { peer?:Port; onmessage?: (m:Message)=>void; closed=false; start(){} close(){this.closed=true;} postMessage(data:unknown){const peer=this.peer;if(!this.closed&&peer)queueMicrotask(()=>{if(!peer.closed)peer.onmessage?.({data});});} }
  let parentListener:((m:Message)=>void)|undefined,childListener:((m:Message)=>void)|undefined;
  let childPort:Port|undefined,version:number|null=9;
  const parent={postMessage(data:unknown){queueMicrotask(()=>parentListener?.({data,source:child,origin:childOrigin}));}};
  const child={postMessage(data:unknown,_origin:string,ports:Port[]){childPort=ports[0];queueMicrotask(()=>childListener?.({data,source:parent,origin,ports}));}};
  const frame={src:origin+doc,contentWindow:child,isConnected:true,getAttribute:()=>"allow-scripts"};
  class Channel {port1=new Port();port2=new Port();constructor(){this.port1.peer=this.port2;this.port2.peer=this.port1;}}
  const native=vi.fn(async()=>new Response("native"));
  const relay=vi.fn(async (_path:string,_init:RequestInit)=>new Response('{"result":"fixture"}',{headers:{"content-type":"application/json","x-tss-serialized":"true"}}));
  vi.stubGlobal("window",{location:{href:origin+"/editor"},addEventListener(_type:string,fn:(m:Message)=>void){parentListener=fn;},removeEventListener(){parentListener=undefined;},setTimeout,clearTimeout});
  vi.stubGlobal("document",{querySelectorAll:()=>[frame]});vi.stubGlobal("MessageChannel",Channel);vi.stubGlobal("fetch",relay);
  const unregister=registered?registerDevelopmentHmrDocument(doc,doc,frame as unknown as HTMLIFrameElement):()=>undefined;
  const bridge=createDevelopmentHmrIframeBridge({documentUrl:doc,...(enabled?{getApplicationRpcVersion:()=>version}:{})});
  const win={parent,fetch:native,location:{href:origin+doc},WebSocket:class extends EventTarget{},addEventListener(_type:string,fn:(m:Message)=>void){childListener=fn;}};
  const html=injectNativeIframeHmrBootstrap("<head></head>",doc);const script=html.split("<script>")[1]!.split("</script>")[0]!;
  runInNewContext(script,{window:win,URL,Headers,Response,TextEncoder,TextDecoder,EventTarget,Event,MessageEvent,DOMException,crypto:{getRandomValues:(bytes:Uint8Array)=>bytes.fill(7)},setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{}});
  return {bridge:{close:()=>{bridge.close();unregister();}},relay,native,bound:()=>Boolean(childPort),fetch:(url:string,init:any=opts)=>(win.fetch as unknown as typeof fetch)(url,init),setVersion:(v:number|null)=>{version=v;},send:(message:unknown)=>childPort?.postMessage(message)};
}
afterEach(()=>vi.unstubAllGlobals());
describe("H10P2C native fetch relay",()=>{
  it("queues an early RPC until binding and reconstructs native serialized response",async()=>{const f=setup();try{const result=await f.fetch(origin+doc+"_serverFn/abc");expect(await result.json()).toEqual({result:"fixture"});expect(result.headers.get("x-tss-serialized")).toBe("true");expect(f.native).not.toHaveBeenCalled();expect(f.relay).toHaveBeenCalledTimes(1);const [url,init]=f.relay.mock.calls[0]!;expect(url).toContain("/development/application-rpc");expect(init.credentials).toBe("same-origin");expect(JSON.parse(String(init.body))).toMatchObject({path:"_serverFn/abc",sourceVersion:9});}finally{f.bridge.close();}});
  it("does not intercept assets and rejects application POST and arbitrary custom headers",async()=>{const f=setup();try{expect(await (await f.fetch(origin+doc+"src/App.tsx")).text()).toBe("native");await expect(f.fetch(origin+doc+"_serverFn/abc",{...opts,method:"POST"})).rejects.toThrow();await expect(f.fetch(origin+doc+"_serverFn/abc",{...opts,headers:{...opts.headers,authorization:"invalid"}})).rejects.toThrow();expect(f.relay).not.toHaveBeenCalled();}finally{f.bridge.close();}});
  it("does not dispatch an already aborted operation",async()=>{const f=setup();try{const abort=new AbortController();abort.abort();await expect(f.fetch(origin+doc+"_serverFn/abc",{...opts,signal:abort.signal})).rejects.toMatchObject({name:"AbortError"});expect(f.relay).not.toHaveBeenCalled();}finally{f.bridge.close();}});
  it("rejects stale in-flight results and does not retry",async()=>{const f=setup();try{f.relay.mockImplementationOnce(async()=>{f.setVersion(10);return new Response('{"result":"old"}',{headers:{"content-type":"application/json","x-tss-serialized":"true"}});});await expect(f.fetch(origin+doc+"_serverFn/abc")).rejects.toThrow();expect(f.relay).toHaveBeenCalledTimes(1);}finally{f.bridge.close();}});
  it("never dispatches or replays GET or POST commands during a revision fence",async()=>{
    const f=setup();try{
      await new Promise(resolve=>setTimeout(resolve,0));
      f.setVersion(null);
      await expect(f.fetch(origin+doc+"_serverFn/abc")).rejects.toThrow();
      const options={method:"POST",headers:{...opts.headers,"content-type":"application/json"},body:'{"data":1}'};
      await expect(f.fetch(origin+doc+"_serverFn/abc",options)).rejects.toThrow();
      expect(f.relay).not.toHaveBeenCalled();
      f.setVersion(10);
      await new Promise(resolve=>setTimeout(resolve,0));
      expect(f.relay).not.toHaveBeenCalled();
      await f.fetch(origin+doc+"_serverFn/abc");
      expect(f.relay).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(f.relay.mock.calls[0]![1].body))).toMatchObject({sourceVersion:10});
    }finally{f.bridge.close();}
  });
  it("rejects a nonmatching base without dispatch",async()=>{const f=setup();try{await new Promise(resolve=>setTimeout(resolve,0));f.send({kind:"application-rpc",id:1,base:doc+"other/",path:"_serverFn/abc"});await new Promise(resolve=>setTimeout(resolve,0));expect(f.relay).not.toHaveBeenCalled();}finally{f.bridge.close();}});
});

it("relays only a bound finite JSON POST once",async()=>{const f=setup();try{
  const options={method:"POST",headers:{...opts.headers,"content-type":"application/json"},body:' {"data":"é"} '};
  await expect(f.fetch(origin+doc+"_serverFn/abc",options)).rejects.toThrow();
  await new Promise(resolve=>setTimeout(resolve,0));
  for(const bad of [{...options,body:"[]"},{...options,body:'{"x":"'+"é".repeat(32768)+'"}'},{...options,headers:{...options.headers,authorization:"evil"}}])await expect(f.fetch(origin+doc+"_serverFn/abc",bad)).rejects.toThrow();
  expect(f.relay).not.toHaveBeenCalled();
  expect(await (await f.fetch(origin+doc+"_serverFn/abc",options)).json()).toEqual({result:"fixture"});
  expect(f.relay).toHaveBeenCalledTimes(1);expect(JSON.parse(String(f.relay.mock.calls[0]![1].body))).toMatchObject({method:"POST",body:options.body,path:"_serverFn/abc",sourceVersion:9});
}finally{f.bridge.close();}});

it("never binds an unregistered document or nonopaque origin",async()=>{
  for(const [origin,registered] of [["null",false],["https://foreign.invalid",true]] as const){
    const f=setup(true,origin,registered);try{
      await new Promise(resolve=>setTimeout(resolve,0));
      expect(f.bound()).toBe(false);expect(f.relay).not.toHaveBeenCalled();
    }finally{f.bridge.close();}
  }
});
it("settles an in-flight mutation on retirement without replay",async()=>{
  const f=setup();try{
    await new Promise(resolve=>setTimeout(resolve,0));
    let finish!:(value:Response)=>void;
    f.relay.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
    const optsPost={method:"POST",headers:{...opts.headers,"content-type":"application/json"},body:'{"data":1}'};
    const pending=f.fetch(origin+doc+"_serverFn/abc",optsPost);
    const rejected=expect(pending).rejects.toThrow();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(f.relay).toHaveBeenCalledTimes(1);
    f.bridge.close();await rejected;
    finish(new Response('{"result":"late"}',{headers:{"content-type":"application/json","x-tss-serialized":"true"}}));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(f.relay).toHaveBeenCalledTimes(1);
    await expect(f.fetch(origin+doc+"_serverFn/abc",optsPost)).rejects.toThrow();
    expect(f.relay).toHaveBeenCalledTimes(1);
  }finally{f.bridge.close();}
});
