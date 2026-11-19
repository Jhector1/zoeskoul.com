/**
 * Phase 4E3C4B3: Vite HMR's native client is housed in a sandboxed opaque-origin
 * iframe. The ticketed browser WebSocket stays in the trusted editor. This
 * bootstrap implements Vite WebSocket delivery and an optional scoped JSON GET
 * relay over a transferred MessagePort; it never receives the ticket, Runner URL
 * or private capability.
 *
 * Must be inserted before Vite's /@vite/client module script (head first).
 */
export const ZOEBUILD_IFRAME_HMR_SCRIPT = String.raw`(function () {
  "use strict";
  if (window.__zoebuildHmrInstalled) return;
  Object.defineProperty(window, "__zoebuildHmrInstalled", {value:true,configurable:false});
  const Native = window.WebSocket;
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes,b=>b.toString(16).padStart(2,"0")).join("");
  const sockets = new Set();
  let channel = null;
  let channelOpen = false;
  let channelGeneration = 0;
  const MAX = 65536;
  const rpcBase = null;
  const rpcPending = new Map();
  let rpcSequence = 0;
  const rpcLimit = 4;
  const rpcBodyLimit = 1048576;
  function settleRpc(id, error, response) {
    const entry=rpcPending.get(id);
    if(!entry)return;
    rpcPending.delete(id);
    clearTimeout(entry.timer);
    entry.signal?.removeEventListener("abort",entry.abort);
    if(error)entry.reject(error);else entry.resolve(response);
  }
  function sendRpc(id, entry) {
    if(!channel || entry.sent || !rpcPending.has(id))return;
    entry.sent=true;
    try{channel.postMessage({kind:"application-rpc",id,base:rpcBase,path:entry.path,...(entry.method==="POST"?{method:"POST",body:entry.body}:{})});}
    catch{settleRpc(id,new TypeError("Preview application request unavailable."));}
  }
  if(rpcBase!==null && typeof window.fetch==="function") {
    const originalFetch=window.fetch.bind(window);
    window.fetch=function(input, init) {
      let url;
      try{url=new URL(typeof input==="string"||input instanceof URL?String(input):input.url,window.location.href);}
      catch{return originalFetch(input,init);}
      const ownOrigin=new URL(window.location.href).origin;
      if(url.origin!==ownOrigin||!url.pathname.startsWith(rpcBase+"_serverFn/"))return originalFetch(input,init);
      // Only bounded native TanStack JSON GET and POST wire protocols are supported.
      const error=()=>new TypeError("Unsupported preview application request.");
      if(typeof input!=="string"&&!(input instanceof URL))return Promise.reject(error());
      let headers;
      try{headers=new Headers(init?.headers);}catch{return Promise.reject(error());}
      // Native fetch defaults an omitted method to GET. TanStack's server
      // function client relies on that standard default in some call paths.
      const method=init?.method===undefined?"GET":init.method;
      const mutation=method==="POST";
      if((method!=="GET"&&!mutation)||init?.credentials==="include"||url.username||url.password||url.hash||
          headers.get("x-tsr-serverfn")!=="true"||headers.get("accept")!=="application/x-tss-framed, application/x-ndjson, application/json"||
          Array.from(headers.keys()).some(k=>k!=="accept"&&k!=="x-tsr-serverfn"&&!(mutation&&k==="content-type")))return Promise.reject(error());
      if(mutation){
        // Never queue a mutation before the editor port has bound.
        if(!channel||url.search||headers.get("content-type")!=="application/json"||typeof init.body!=="string"||
            !init.body.length||init.body.length>65536)return Promise.reject(error());
        const bytes=new TextEncoder().encode(init.body);
        if(bytes.length>65536||new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)!==init.body)return Promise.reject(error());
        try{const value=JSON.parse(init.body);if(!value||typeof value!=="object"||Array.isArray(value))return Promise.reject(error());}catch{return Promise.reject(error());}
      }else if(init?.body!=null)return Promise.reject(error());
      const path=url.pathname.slice(rpcBase.length)+url.search;
      if(path.length>4096||/[\\#\u0000-\u0020\u007f]/.test(path)||!/^_serverFn\/[A-Za-z0-9_-]{1,2048}(?:\?payload=[^&?]*)?$/.test(path)||
          rpcPending.size>=rpcLimit)return Promise.reject(error());
      const signal=init?.signal;
      if(signal?.aborted)return Promise.reject(new DOMException("Aborted","AbortError"));
      return new Promise((resolve,reject)=>{
        const id=++rpcSequence;
        const abort=()=>settleRpc(id,new DOMException("Aborted","AbortError"));
        const timer=setTimeout(()=>settleRpc(id,new TypeError("Preview application request timed out.")),30000);
        const entry={path,method,body:mutation?init.body:undefined,signal,abort,timer,resolve,reject,sent:false};
        rpcPending.set(id,entry);
        signal?.addEventListener("abort",abort,{once:true});
        if(signal?.aborted)abort();else sendRpc(id,entry);
      });
    };
  }
  class VirtualViteSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.protocol = "vite-hmr";
      this.binaryType = "blob";
      this.bufferedAmount = 0;
      this.extensions = "";
      this.readyState = 0;
      this.openScheduled = false;
      this.connectedSeen = false;
      this.onopen = null; this.onmessage = null;
      this.onclose = null; this.onerror = null;
      sockets.add(this);
      if (channelOpen) this.scheduleOpen();
    }
    emit(type, event) {
      this.dispatchEvent(event);
      const listener = this["on" + type];
      if (typeof listener === "function") listener.call(this,event);
    }
    scheduleOpen() {
      if (this.readyState !== 0 || this.openScheduled) return;
      this.openScheduled = true;
      const generation = channelGeneration;
      // WebSocket open is asynchronous. Vite must first install listeners.
      setTimeout(() => {
        this.openScheduled = false;
        if (this.readyState !== 0 || !channelOpen || !channel || generation !== channelGeneration) return;
        this.readyState = 1;
        this.emit("open",new Event("open"));
        if (this.readyState === 1) channel.postMessage({kind:"client-ready",generation});
      },0);
    }
    send(data) {
      if (this.readyState !== 1 || !channel) throw new DOMException("Not connected", "InvalidStateError");
      // The Runner only accepts native Vite ping, never arbitrary iframe input.
      if (data === '{"type":"ping"}') channel.postMessage({kind:"ping"});
    }
    receive(data) {
      if (this.readyState !== 1 || typeof data !== "string" || data.length > MAX) return;
      // Socket rotation or another virtual client can replay the actual
      // handshake. Deliver it only once to each open virtual socket.
      let type;
      try {type=JSON.parse(data).type;} catch {return;}
      if (type === "connected") {
        if (this.connectedSeen) return;
        this.connectedSeen = true;
      }
      this.emit("message",new MessageEvent("message",{data}));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      sockets.delete(this);
      this.emit("close",new CloseEvent("close",{code:1000,wasClean:true}));
    }
  }
  VirtualViteSocket.CONNECTING=0;VirtualViteSocket.OPEN=1;
  VirtualViteSocket.CLOSING=2;VirtualViteSocket.CLOSED=3;
  window.WebSocket = new Proxy(Native, {
    construct(target,args) {
      const protocols = args[1];
      if (protocols === "vite-hmr" || (Array.isArray(protocols) && protocols.length===1 && protocols[0]==="vite-hmr"))
        return new VirtualViteSocket(args[0]);
      return Reflect.construct(target,args);
    }
  });
  window.addEventListener("message",function accept(event) {
    if (event.source !== window.parent || !event.data || event.data.kind !== "zoebuild-hmr-port" ||
        event.data.nonce !== nonce || event.ports.length !== 1 || channel ||
        (rpcBase!==null && event.origin!==new URL(window.location.href).origin)) return;
    channel = event.ports[0];
    channel.onmessage = function(message) {
      const value=message.data;
      if (!value || typeof value!=="object") return;
      if (value.kind==="open" && Number.isSafeInteger(value.generation) && value.generation > 0) {
        channelGeneration=value.generation;
        channelOpen=true;
        for (const socket of sockets) socket.scheduleOpen();
      } else if (value.kind==="frame" && channelOpen && typeof value.text==="string" && value.text.length <= MAX) {
        for (const socket of sockets) socket.receive(value.text);
      } else if (rpcBase!==null && value.kind==="application-rpc-result" && Number.isSafeInteger(value.id)) {
        if(!rpcPending.has(value.id))return;
        if(value.error===true || !Number.isInteger(value.status) ||
            !((value.status>=200&&value.status<300&&value.status!==204&&value.status!==205)||(value.status>=400&&value.status<=599)) ||
            typeof value.body!=="string"||value.body.length>rpcBodyLimit||new TextEncoder().encode(value.body).length>rpcBodyLimit) {
          settleRpc(value.id,new TypeError("Preview application request unavailable."));return;
        }
        try{settleRpc(value.id,null,new Response(value.body,{status:value.status,headers:{"content-type":"application/json","x-tss-serialized":"true"}}));}
        catch{settleRpc(value.id,new TypeError("Preview application request unavailable."));}
      } else if (value.kind==="disconnect") {
        channelOpen=false;
        channelGeneration=0;
        for (const socket of sockets) socket.close();
      }
    };
    channel.start();
    channel.postMessage({kind:"bound"});
    if(rpcBase!==null)for(const [id,entry] of rpcPending)sendRpc(id,entry);
  });
  let attempts=0;
  const announce=setInterval(function () {
    if (channel || ++attempts > 20) {clearInterval(announce);return;}
    window.parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce},"*");
  },250);
  window.parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce},"*");
})();`;

/** Fail closed rather than inserting after Vite's client has already loaded. */
export function injectNativeIframeHmrBootstrap(html: string, applicationBase?: string): string {
  if (typeof html !== "string" || html.length > 6*1024*1024 || html.includes("__zoebuildHmrInstalled"))
    throw new Error("Unsafe HMR document.");
  const head=/<head(?:\s[^<>]*)?>/i.exec(html);
  if (!head || head.index === undefined) throw new Error("No safe HMR insertion point.");
  const offset=head.index+head[0].length;
  if(applicationBase!==undefined && !/^\/api\/build\/projects\/[A-Za-z0-9_-]{1,128}\/preview\/preview_[a-f0-9-]{36}\/development\/content\/dpg1\.[A-Za-z0-9_-]{43}\/$/i.test(applicationBase))
    throw new Error("Unsafe application RPC base.");
  const script=applicationBase===undefined?ZOEBUILD_IFRAME_HMR_SCRIPT:
    ZOEBUILD_IFRAME_HMR_SCRIPT.replace("const rpcBase = null;","const rpcBase = "+JSON.stringify(applicationBase)+";");
  return html.slice(0,offset)+"<script>"+script+"</script>"+html.slice(offset);
}
