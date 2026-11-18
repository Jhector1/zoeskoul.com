/** Browser-only transport bridge. The trusted editor owns a ticketed WebSocket;
 * the sandboxed iframe receives only Vite protocol payloads on a MessagePort.
 * No secrets, credentials, source files or privileged commands cross the port.
 */
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
  function discard() {
    try {port?.close();} catch { /* iframe may have navigated */ }
    port=null;
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
      // This acknowledgement only releases already-authorized frames to
      // this port. No iframe command reaches the authenticated Runner.
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
