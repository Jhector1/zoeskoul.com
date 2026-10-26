import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { PREVIEW_NAV_SCRIPT, injectReactPreviewNavigationBridge } from "./reactPreviewNavigationBridge";

const ROOT = "/api/build/projects/cmva2y8l2000221dl6w20b5cm/preview/preview_59720432-74e1-4981-b39f-935d224527a4/content/b2Hm7pSq6IejPeBrAyPkopRbQV7KQS-d/";
const CHANNEL = "zoebuild.preview.navigation.v1";

type BridgeMessage = { type: string; status?: string; reason?: string; route?: string; revision?: string };

function sandboxBridge(config: { scriptPresent?: boolean; configuredRoot?: string } = {}) {
  let address = new URL(`https://build.local${ROOT}?__zb_preview_revision=9`);
  const messages: BridgeMessage[] = [];
  const listeners = new Map<string, (event: {source?: unknown; data?: unknown}) => void>();
  const parent = { postMessage: (data: BridgeMessage) => messages.push(data) };
  const win = {
    parent,
    addEventListener: (name: string, fn: (event: {source?: unknown; data?: unknown}) => void) => listeners.set(name, fn),
    dispatchEvent: () => undefined,
  };
  const script = {getAttribute: (name: string) => name === "src" ? `${ROOT}__zoebuild/navigation.js` :
    name === "data-zoebuild-preview-root" ? (config.configuredRoot ?? ROOT) : null};
  const document = {
    currentScript: null, // Reproduces the browser bootstrap problem.
    querySelector: () => config.scriptPresent === false ? null : script,
    getElementById: () => ({childElementCount: 1}),
    documentElement: {},
  };
  const location = {
    get href() {return address.href;},
    get pathname() {return address.pathname;},
    get search() {return address.search;},
    get hash() {return address.hash;},
    get origin() {return "null";}, // Opaque iframe origin differs from the URL address origin.
  };
  const history = {
    pushState: (_value: unknown, _unused: string, url: string) => {address = new URL(url, address);},
    replaceState: (_value: unknown, _unused: string, url: string) => {address = new URL(url, address);},
    back: () => undefined,
    forward: () => undefined,
  };
  runInNewContext(PREVIEW_NAV_SCRIPT, {
    document, history, location, window: win, URL, URLSearchParams,
    MutationObserver: class { observe() {} },
    PopStateEvent: class {},
    setInterval: () => 1,
    setTimeout: () => 1,
  }, {timeout: 2000});
  return {messages, listeners, history, parent};
}

describe("V12K4D trusted preview navigation boot protocol", () => {
  it("initializes without currentScript and reports the live React page with stable revision", () => {
    const browser = sandboxBridge();
    expect(browser.messages).toContainEqual(expect.objectContaining({type:"bootstrap",status:"installed",revision:"9"}));
    expect(browser.messages).toContainEqual(expect.objectContaining({type:"state",route:"/",revision:"9"}));
    browser.history.pushState({}, "", `${ROOT}approach`);
    expect(browser.messages).toContainEqual(expect.objectContaining({type:"state",route:"/approach",revision:"9"}));
    browser.listeners.get("message")?.({source: browser.parent,
      data: {channel:CHANNEL,type:"command",action:"navigate",route:"/shop"}});
    expect(browser.messages).toContainEqual(expect.objectContaining({type:"state",route:"/shop",revision:"9"}));
  });
  it("reports an initialization failure rather than silently claiming route readiness", () => {
    const wrongRoot = sandboxBridge({configuredRoot:"/wrong/"}).messages;
    expect(wrongRoot).toContainEqual(expect.objectContaining({type:"bootstrap",status:"failed",reason:"document-root-invalid"}));
    expect(wrongRoot.filter(message=>message.type==="state")).toHaveLength(0);
    const missingScript = sandboxBridge({scriptPresent:false}).messages;
    expect(missingScript).toContainEqual(expect.objectContaining({type:"bootstrap",status:"failed",reason:"script-missing"}));
  });
  it("injects only one configured external bridge for a trusted preview root", () => {
    const html = '<html><head><script type="module" src="/src/main.tsx"></script></head><body></body></html>';
    const result = injectReactPreviewNavigationBridge(html,ROOT);
    expect(result).toContain(`data-zoebuild-preview-root="${ROOT}"`);
    expect(result).toContain(`src="${ROOT}__zoebuild/navigation.js"`);
    expect(injectReactPreviewNavigationBridge(result,ROOT)).toBe(result);
    expect(injectReactPreviewNavigationBridge(html,"/unsafe/")).toBe(html);
  });
});
