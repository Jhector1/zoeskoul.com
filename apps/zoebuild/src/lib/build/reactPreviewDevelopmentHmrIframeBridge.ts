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
}>) {
  if (!PUBLIC_DOC.test(input.documentUrl)) throw new Error("Invalid HMR document grant.");
  let closed=false;
  let connected=false;
  let port: MessagePort | null=null;
  const buffered: string[]=[];
  let previousNonce:string|null=null;
  function discard() {
    try {port?.close();} catch { /* iframe may have navigated */ }
    port=null;
  }
  function onMessage(event:MessageEvent) {
    if (closed || !event.data || typeof event.data!=="object" ||
        event.data.kind!=="zoebuild-hmr-iframe-ready" || !NONCE.test(event.data.nonce)) return;
    const frame=uniqueIframe(input.documentUrl);
    if (!frame?.contentWindow || frame.contentWindow!==event.source || event.data.nonce===previousNonce) return;
    previousNonce=event.data.nonce;
    discard();
    const channel=new MessageChannel();
    port=channel.port1;
    port.onmessage=(message:MessageEvent)=>{
      if (message.data?.kind==="bound") input.onBound?.();
      // All other iframe-originated messages (including arbitrary source)
      // are ignored; no untrusted command reaches the authenticated Runner.
    };
    port.start();
    frame.contentWindow.postMessage({kind:"zoebuild-hmr-port",nonce:previousNonce},"*",[channel.port2]);
    if (connected) port.postMessage({kind:"open"});
    for (const text of buffered.splice(0)) port.postMessage({kind:"frame",text});
  }
  window.addEventListener("message",onMessage);
  function setConnected(value:boolean) {
    if (closed) return;
    connected=value;
    if (!value) {
      buffered.length=0;
      port?.postMessage({kind:"disconnect"});
    } else {
      port?.postMessage({kind:"open"});
      if (port) for (const text of buffered.splice(0)) port.postMessage({kind:"frame",text});
    }
  }
  function push(raw:unknown) {
    if (closed) return;
    const text=safeViteIframeFrame(raw,input.documentUrl);
    if (text===null) return;
    if (connected && port) port.postMessage({kind:"frame",text});
    else if (buffered.length<16) buffered.push(text);
  }
  function close() {
    if (closed) return;
    closed=true;
    buffered.length=0;
    window.removeEventListener("message",onMessage);
    port?.postMessage({kind:"disconnect"});
    discard();
  }
  return {setConnected,push,close};
}
