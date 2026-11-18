/**
 * Phase 4E3C4B3: Vite HMR's native client is housed in a sandboxed opaque-origin
 * iframe. The ticketed browser WebSocket stays in the trusted editor. This
 * bootstrap implements ONLY the Vite websocket subprotocol over a transferred
 * MessagePort; it never receives the ticket, Runner URL or private capability.
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
        event.data.nonce !== nonce || event.ports.length !== 1 || channel) return;
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
      } else if (value.kind==="disconnect") {
        channelOpen=false;
        channelGeneration=0;
        for (const socket of sockets) socket.close();
      }
    };
    channel.start();
    channel.postMessage({kind:"bound"});
  });
  let attempts=0;
  const announce=setInterval(function () {
    if (channel || ++attempts > 20) {clearInterval(announce);return;}
    window.parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce},"*");
  },250);
  window.parent.postMessage({kind:"zoebuild-hmr-iframe-ready",nonce},"*");
})();`;

/** Fail closed rather than inserting after Vite's client has already loaded. */
export function injectNativeIframeHmrBootstrap(html: string): string {
  if (typeof html !== "string" || html.length > 6*1024*1024 || html.includes("__zoebuildHmrInstalled"))
    throw new Error("Unsafe HMR document.");
  const head=/<head(?:\s[^<>]*)?>/i.exec(html);
  if (!head || head.index === undefined) throw new Error("No safe HMR insertion point.");
  const offset=head.index+head[0].length;
  return html.slice(0,offset)+"<script>"+ZOEBUILD_IFRAME_HMR_SCRIPT+"</script>"+html.slice(offset);
}
