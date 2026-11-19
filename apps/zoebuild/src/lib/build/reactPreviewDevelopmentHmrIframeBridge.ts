/** Browser-only transport bridge. The trusted editor owns a ticketed WebSocket;
 * the sandboxed iframe receives Vite protocol payloads and, when enabled, a
 * scoped JSON GET application relay. No platform credentials or Runner secrets
 * cross the port.
 */
import { applicationRpcIdentity, applicationRpcPath, applicationRpcStatus, APPLICATION_RPC_MAX_BODY_BYTES, applicationMutationBody, applicationMutationPath } from "./reactPreviewDevelopmentApplicationProtocol";

const FRAME_LIMIT = 65_536;
const NONCE = /^[0-9a-f]{32}$/;
const PUBLIC_DOC = /^\/api\/build\/projects\/[A-Za-z0-9_-]{1,128}\/preview\/preview_[a-f0-9-]{36}\/development\/content\/dpg1\.[A-Za-z0-9_-]{43}\/$/i;
const VITE_KINDS = new Set(["connected", "update", "full-reload", "prune", "error", "custom"]);
export const PUBLIC_BASE_MARKER = "/__zoebuild_dev_preview_public_base__/";

export function safeViteIframeFrame(raw: unknown, publicBase: string): string | null {
  if (typeof raw !== "string" || raw.length > FRAME_LIMIT || !PUBLIC_DOC.test(publicBase)) return null;
  let value: unknown;
  try {value=JSON.parse(raw);} catch {return null;}
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      !VITE_KINDS.has((value as {type?:unknown}).type as string)) return null;
  if (/\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/preview_[a-f0-9-]+\/content\/[A-Za-z0-9_-]{32}\//i.test(raw)) return null;
  const normalized=raw.split(PUBLIC_BASE_MARKER).join(publicBase);
  return normalized.length <= FRAME_LIMIT ? normalized : null;
}

// Only the trusted React renderer may register the precise document it created.
// A same-origin URL prefix alone is NOT proof of iframe ownership.
type RegisteredDocument = Readonly<{frame:HTMLIFrameElement; url:string}>;
const documents=new Map<string, Map<RegisteredDocument,symbol>>();
const documentIdentity=new WeakMap<HTMLIFrameElement,RegisteredDocument>();
export function registerDevelopmentHmrDocument(root:string, documentUrl:string, frame:HTMLIFrameElement):()=>void {
  if (!PUBLIC_DOC.test(root)) return ()=>undefined;
  const base=new URL(root,window.location.href);
  const url=new URL(documentUrl,window.location.href);
  if (url.origin!==base.origin || url.username || url.password ||
      !url.pathname.startsWith(base.pathname) || frame.src!==url.href ||
      frame.getAttribute("sandbox")!=="allow-scripts") return ()=>undefined;
  const previous=documentIdentity.get(frame);
  const entry=previous?.url===url.href?previous:{frame,url:url.href};
  documentIdentity.set(frame,entry);
  const entries=documents.get(root)??new Map<RegisteredDocument,symbol>();
  const generation=Symbol();entries.set(entry,generation);documents.set(root,entries);
  return ()=>{
    if(entries.get(entry)!==generation)return;
    entries.delete(entry);if(!entries.size && documents.get(root)===entries)documents.delete(root);
  };
}
function uniqueDocument(root:string):RegisteredDocument|null {
  const entries=documents.get(root);
  if(!entries || entries.size!==1)return null;
  const entry=entries.keys().next().value;
  return entry && entry.frame.isConnected && entry.frame.src===entry.url &&
    entry.frame.getAttribute("sandbox")==="allow-scripts" ? entry : null;
}

export function createDevelopmentHmrIframeBridge(input: Readonly<{
  documentUrl:string;
  onBound?:()=>void;
  onClientReady?:()=>void;
  onDeliveryFailure?:()=>void;
  onResync?:()=>void;
  getApplicationRpcVersion?:()=>number|null;
  canDeliverFrames?:()=>boolean;
}>) {
  if (!PUBLIC_DOC.test(input.documentUrl)) throw new Error("Invalid HMR document grant.");
  let closed=false;
  let connected=false;
  let connectionGeneration=0;
  let port: MessagePort | null=null;
  const buffered: string[]=[];
  let clientReady=false;
  let connectedFrame:string|null=null;
  let connectedDelivered=false;
  let boundDocument:RegisteredDocument|null=null;
  let boundNonce:string|null=null;
  let offerSequence=0;
  let confirmedOffer=0;
  const candidates=new Map<string,{port:MessagePort;timer:ReturnType<typeof setTimeout>;offer:number}>();
  // A transport gap is not a reliable Vite event stream. Only the parent
  // may recover by loading the exact currently authorized document.
  let needsResync=false;
  let resyncTimer:ReturnType<typeof setTimeout>|null=null;
  const rpcInflight=new Set<AbortController>();
  let lastRpcId=0;
  async function relayApplicationRpc(current:MessagePort, value:unknown, document:RegisteredDocument) {
    if(!value||typeof value!=="object"||Array.isArray(value))return;
    const command=value as Record<string,unknown>;
    const id=command.id;
    if(typeof id!=="number"||!Number.isSafeInteger(id)||id<=lastRpcId)return;
    lastRpcId=id;
    const reply=(data:Record<string,unknown>)=>{
      if(!closed&&port===current&&uniqueDocument(input.documentUrl)===document)
        try{current.postMessage({kind:"application-rpc-result",id,...data});}catch{/* retired port */}
    };
    const identity=applicationRpcIdentity(input.documentUrl);
    const version=input.getApplicationRpcVersion?.();
    const keys=Object.keys(command).sort().join(",");
    const mutation=keys==="base,body,id,kind,method,path"&&command.method==="POST";
    const operation=mutation&&applicationMutationPath(command.path)&&applicationMutationBody(command.body)
      ? {method:"POST",body:command.body} : null;
    if(needsResync||!identity||!input.getApplicationRpcVersion||typeof version!=="number"||!Number.isSafeInteger(version)||version<1||
      (mutation?!operation:keys!=="base,id,kind,path")||command.base!==input.documentUrl||
      !applicationRpcPath(command.path)||rpcInflight.size>=4){reply({error:true});return;}
    const abort=new AbortController();rpcInflight.add(abort);
    const timer=window.setTimeout(()=>abort.abort(),25000);
    try {
      // Fixed relative endpoint derived from the editor's current lease, never
      // a URL or actor selected by the iframe. Exactly one dispatch, no retries.
      const endpoint=`/api/build/projects/${identity.buildProjectId}/preview/${identity.previewId}/development/application-rpc`;
      const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
        signal:abort.signal,headers:{"content-type":"application/json"},
        body:JSON.stringify({grantToken:identity.grantToken,path:command.path,sourceVersion:version,...(operation??{})})});
      if(!applicationRpcStatus(response.status)||response.headers.get("x-tss-serialized")!=="true"||
          response.headers.get("content-type")!=="application/json"||!response.body)throw new Error("Invalid RPC response.");
      const reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});
      let bytes=0,body="";
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
          if(bytes>APPLICATION_RPC_MAX_BODY_BYTES)throw new Error("RPC response too large.");body+=decoder.decode(value,{stream:true});}
        body+=decoder.decode();JSON.parse(body);
      }catch(error){void reader.cancel().catch(()=>undefined);throw error;}finally{reader.releaseLock();}
      if(abort.signal.aborted||input.getApplicationRpcVersion()!==version)throw new Error("Stale RPC response.");
      reply({status:response.status,body});
    }catch{reply({error:true});}finally{window.clearTimeout(timer);rpcInflight.delete(abort);}
  }
  function discard() {
    // Settle old iframe promises explicitly; never replay a sent operation.
    try {port?.postMessage({kind:"retired"});port?.close();} catch { /* iframe may have navigated */ }
    port=null;boundDocument=null;boundNonce=null;
    for(const controller of rpcInflight)controller.abort();
    rpcInflight.clear();lastRpcId=0;
    clientReady=false;
    connectedDelivered=false;
  }
  function flush() {
    if (closed || !connected || !port || !connectedFrame ||
        uniqueDocument(input.documentUrl)!==boundDocument ||
        input.canDeliverFrames?.() === false) return;
    if (needsResync) {
      const document=uniqueDocument(input.documentUrl);
      if (!document?.frame.contentWindow || document!==boundDocument) return;
      const frame=document.frame;
      // The gap may have lost arbitrary Vite updates. Do not synthesize a
      // Vite reconnect, replay RPCs, or deliver buffered updates to stale JS.
      // Reload only this exact authorized iframe, not the editor or runtime.
      const target=document.url;
      discard();
      buffered.length=0;
      needsResync=false;
      input.onResync?.();
      if(resyncTimer===null)resyncTimer=setTimeout(()=>{
        resyncTimer=null;close();input.onDeliveryFailure?.();
      },15_000);
      try { frame.src=target; }
      catch { close();input.onDeliveryFailure?.(); }
      return;
    }
    if (!clientReady) return;
    if (!connectedDelivered) {
      port.postMessage({kind:"frame",text:connectedFrame});
      connectedDelivered=true;
    }
    for (const text of buffered.splice(0)) port.postMessage({kind:"frame",text});
    if(resyncTimer!==null){clearTimeout(resyncTimer);resyncTimer=null;}
  }
  function retireCandidate(nonce:string) {
    const candidate=candidates.get(nonce);if(!candidate)return;
    candidates.delete(nonce);clearTimeout(candidate.timer);
    try{candidate.port.postMessage({kind:"retired"});candidate.port.close();}catch{/* unbound */}
  }
  function onMessage(event:MessageEvent) {
    if (closed || event.origin!=="null" || !event.data || typeof event.data!=="object" ||
        event.data.kind!=="zoebuild-hmr-iframe-ready" || typeof event.data.nonce!=="string" || !NONCE.test(event.data.nonce)) return;
    const document=uniqueDocument(input.documentUrl);
    const frame=document?.frame;
    const nonce=event.data.nonce;
    if (!document || !frame?.contentWindow || frame.contentWindow!==event.source ||
        (boundDocument===document && boundNonce===nonce) || candidates.has(nonce) || candidates.size>=4) return;
    // A WindowProxy can survive document navigation. A stale announcement may
    // arrive after a newer document is installed. Do not evict the live port
    // until the candidate proves it accepted the transfer for its own nonce.
    const channel=new MessageChannel();
    const current=channel.port1;
    const offer=++offerSequence;
    const timer=setTimeout(()=>retireCandidate(nonce),5000);
    candidates.set(nonce,{port:current,timer,offer});
    current.onmessage=(message:MessageEvent)=>{
      if(closed)return;
      if(candidates.get(nonce)?.port===current) {
        if(message.data?.kind!=="bound")return;
        if(offer<=confirmedOffer || uniqueDocument(input.documentUrl)!==document || frame.contentWindow!==event.source) {
          retireCandidate(nonce);return;
        }
        candidates.delete(nonce);clearTimeout(timer);
        // An older handshake must not retire a newer confirmed document.
        discard();
        port=current;boundDocument=document;boundNonce=nonce;confirmedOffer=offer;
        for(const [other,candidate] of candidates)if(candidate.offer<offer)retireCandidate(other);
        input.onBound?.();
        if(connected)current.postMessage({kind:"open",generation:connectionGeneration});
        flush();return;
      }
      if(port!==current || boundDocument!==document || uniqueDocument(input.documentUrl)!==document)return;
      if (message.data?.kind==="client-ready" && connected &&
          message.data.generation===connectionGeneration) {
        if (!clientReady) input.onClientReady?.();
        clientReady=true;
        connectedDelivered=false;
        flush();
      } else if (message.data?.kind==="application-rpc" && input.getApplicationRpcVersion) {
        void relayApplicationRpc(current,message.data,document);
      }
    };
    current.start();
    try{frame.contentWindow.postMessage({kind:"zoebuild-hmr-port",nonce},"*",[channel.port2]);}
    catch{retireCandidate(nonce);}
  }
  window.addEventListener("message",onMessage);
  function setConnected(value:boolean) {
    if (closed) return;
    const changed=connected!==value;
    connected=value;
    if (changed) connectionGeneration++;
    if (!value) {
      // Do not mistake a real gap for healthy ticket rotation. Any old
      // document must be resynchronized once an actual new handshake AND
      // the exact renewed grant are available. Never signal Vite to use
      // its own opaque-origin-incompatible SharedWorker reconnection.
      if(changed)needsResync=true;
      buffered.length=0;
      connectedFrame=null;
      connectedDelivered=false;
      clientReady=false;
      port?.postMessage({kind:"disconnect"});
    } else {
      if (changed) port?.postMessage({kind:"open",generation:connectionGeneration});
      flush();
    }
  }
  function push(raw:unknown) {
    if (closed) return;
    const text=safeViteIframeFrame(raw,input.documentUrl);
    if (text===null) return;
    if (JSON.parse(text).type==="connected") {
      connectedFrame=text;
      flush();
      return;
    }
    if (buffered.length>=16) {
      // Never silently discard an update and claim the client is current.
      close();
      input.onDeliveryFailure?.();
      return;
    }
    buffered.push(text);
    flush();
  }
  function close() {
    if (closed) return;
    closed=true;
    if(resyncTimer!==null){clearTimeout(resyncTimer);resyncTimer=null;}
    buffered.length=0;
    connectedFrame=null;
    window.removeEventListener("message",onMessage);
    for(const nonce of [...candidates.keys()])retireCandidate(nonce);
    port?.postMessage({kind:"disconnect"});
    discard();
  }
  return {setConnected,push,close,flushReady:flush};
}
