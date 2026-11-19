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

function uniqueIframe(expectedPath: string): HTMLIFrameElement | null {
  const expected = new URL(expectedPath,window.location.href).href;
  const candidates=Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
    .filter(frame=>frame.src===expected);
  // Never attach a port to an ambiguous or unintended iframe.
  return candidates.length===1 ? candidates[0] : null;
}

export function createDevelopmentHmrIframeBridge(input: Readonly<{
  documentUrl:string;
  onBound?:()=>void;
  onClientReady?:()=>void;
  onDeliveryFailure?:()=>void;
  getApplicationRpcVersion?:()=>number|null;
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
  let previousNonce:string|null=null;
  const rpcInflight=new Set<AbortController>();
  let lastRpcId=0;
  async function relayApplicationRpc(current:MessagePort, value:unknown, frame:HTMLIFrameElement) {
    if(!value||typeof value!=="object"||Array.isArray(value))return;
    const command=value as Record<string,unknown>;
    const id=command.id;
    if(typeof id!=="number"||!Number.isSafeInteger(id)||id<=lastRpcId)return;
    lastRpcId=id;
    const reply=(data:Record<string,unknown>)=>{
      if(!closed&&port===current&&uniqueIframe(input.documentUrl)===frame)
        try{current.postMessage({kind:"application-rpc-result",id,...data});}catch{/* retired port */}
    };
    const identity=applicationRpcIdentity(input.documentUrl);
    const version=input.getApplicationRpcVersion?.();
    const keys=Object.keys(command).sort().join(",");
    const mutation=keys==="base,body,id,kind,method,path"&&command.method==="POST";
    const operation=mutation&&applicationMutationPath(command.path)&&applicationMutationBody(command.body)
      ? {method:"POST",body:command.body} : null;
    if(!identity||!input.getApplicationRpcVersion||typeof version!=="number"||!Number.isSafeInteger(version)||version<1||
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
    try {port?.close();} catch { /* iframe may have navigated */ }
    port=null;
    for(const controller of rpcInflight)controller.abort();
    rpcInflight.clear();lastRpcId=0;
    clientReady=false;
    connectedDelivered=false;
  }
  function flush() {
    if (closed || !connected || !port || !clientReady || !connectedFrame) return;
    if (!connectedDelivered) {
      port.postMessage({kind:"frame",text:connectedFrame});
      connectedDelivered=true;
    }
    for (const text of buffered.splice(0)) port.postMessage({kind:"frame",text});
  }
  function onMessage(event:MessageEvent) {
    if (closed || !event.data || typeof event.data!=="object" ||
        event.data.kind!=="zoebuild-hmr-iframe-ready" || !NONCE.test(event.data.nonce)) return;
    const frame=uniqueIframe(input.documentUrl);
    if (!frame?.contentWindow || frame.contentWindow!==event.source || event.data.nonce===previousNonce) return;
    previousNonce=event.data.nonce;
    discard();
    const channel=new MessageChannel();
    const current=channel.port1;
    port=current;
    current.onmessage=(message:MessageEvent)=>{
      if (closed || port!==current) return;
      if (message.data?.kind==="bound") input.onBound?.();
      else if (message.data?.kind==="client-ready" && connected &&
          message.data.generation===connectionGeneration) {
        if (!clientReady) input.onClientReady?.();
        clientReady=true;
        // A fresh virtual socket needs the actual Vite connected frame.
        connectedDelivered=false;
        flush();
      }
      else if (message.data?.kind==="application-rpc" && event.origin==="null" && input.getApplicationRpcVersion &&
          uniqueIframe(input.documentUrl)===frame) {
        void relayApplicationRpc(current,message.data,frame);
      }
      // All other iframe commands are ignored. RPC has a separate fixed and
      // authenticated endpoint; it never sends arbitrary commands to Runner.
    };
    port.start();
    frame.contentWindow.postMessage({kind:"zoebuild-hmr-port",nonce:previousNonce},"*",[channel.port2]);
    if (connected) port.postMessage({kind:"open",generation:connectionGeneration});
  }
  window.addEventListener("message",onMessage);
  function setConnected(value:boolean) {
    if (closed) return;
    const changed=connected!==value;
    connected=value;
    if (changed) connectionGeneration++;
    if (!value) {
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
    buffered.length=0;
    connectedFrame=null;
    window.removeEventListener("message",onMessage);
    port?.postMessage({kind:"disconnect"});
    discard();
  }
  return {setConnected,push,close};
}
