import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { PREVIEW_NAV_SCRIPT } from "./reactPreviewNavigationBridge";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "/api/build/projects/fixture/preview/preview_11111111-1111-1111-1111-111111111111/content/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/";
const SRC = ROOT + "__zoebuild/navigation.js";

type Child = { tagName: string; childElementCount: number; textContent: string };
function child(tagName: string, childElementCount = 0, textContent = ""): Child {
  return { tagName, childElementCount, textContent };
}
function simulate(options: {
  root?: { childElementCount: number; textContent: string } | null;
  body?: { children: Child[] } | null;
  onObserve?: (notify: () => void) => void;
}) {
  const url = new URL(`https://zoe.test${ROOT}preview-document?__zb_preview_route=%2F&__zb_preview_revision=4`);
  let current = url;
  const states: Record<string, unknown>[] = [];
  const parent = { postMessage: (message: Record<string, unknown>) => {
    if (message.type === "state") states.push(message);
  } };
  const script = { getAttribute: (name: string) =>
    name === "src" ? SRC : name === "data-zoebuild-preview-root" ? ROOT : null };
  const document = {
    currentScript: script,
    querySelector: () => script,
    getElementById: () => options.root ?? null,
    get body() { return options.body ?? null; },
    documentElement: {},
  };
  const location = {
    get href() { return current.href; },
    get pathname() { return current.pathname; },
    get search() { return current.search; },
    get hash() { return current.hash; },
  };
  const history = {
    state: null,
    replaceState: (_data: unknown, _unused: string, to: string) => { current = new URL(to, current); },
    pushState: (_data: unknown, _unused: string, to: string) => { current = new URL(to, current); },
    back: () => {}, forward: () => {},
  };
  const window = { parent, addEventListener: () => {}, dispatchEvent: () => {} };
  class Observer {
    constructor(private readonly callback: () => void) {}
    observe() { options.onObserve?.(this.callback); }
  }
  runInNewContext(PREVIEW_NAV_SCRIPT, {
    window, document, location, history, URL, URLSearchParams,
    MutationObserver: Observer, setInterval: () => 0,
    setTimeout: () => 0, PopStateEvent: class {},
  }, { timeout: 2000 });
  return states;
}

describe("TanStack Start SSR render acknowledgement", () => {
  it("tests the actual canonical SSR blueprint, which does not mount #root", () => {
    const template = readFileSync(resolve(__dirname, "../../../../../packages/build-template-registry/src/tanstackStartTemplate.ts"), "utf8");
    expect(template).toContain("<html lang=");
    expect(template).toContain("<body>");
    expect(template).not.toContain('id=\\\"root\\\"');
  });
  it("recognizes meaningful SSR content without a SPA #root", () => {
    const states = simulate({root:null,body:{children:[
      child("SCRIPT"), child("DIV", 2, "Welcome to the site"), child("SCRIPT"),
    ]}});
    expect(states).toContainEqual(expect.objectContaining({rendered:true,revision:"4",route:"/"}));
  });
  it("does not mistake JavaScript tags or empty placeholders for rendered HTML", () => {
    const states = simulate({root:null,body:{children:[
      child("SCRIPT", 0, "script text"), child("STYLE", 0, "css"),
      child("DIV", 0, ""), child("TEMPLATE", 3, "not mounted"),
    ]}});
    expect(states).toContainEqual(expect.objectContaining({rendered:false}));
  });
  it("keeps the SPA contract: an empty #root is not rendered", () => {
    const states = simulate({root:{childElementCount:0,textContent:""},
      body:{children:[child("DIV", 2, "unrelated")]} });
    expect(states).toContainEqual(expect.objectContaining({rendered:false}));
  });
  it("reports SSR content populated after initial head-script execution", () => {
    const body = {children:[] as Child[]};
    let notify = () => {};
    const states = simulate({root:null,body,onObserve: cb => {notify = cb;}});
    expect(states).toContainEqual(expect.objectContaining({rendered:false}));
    body.children.push(child("MAIN",1,"Hello"));
    notify();
    expect(states).toContainEqual(expect.objectContaining({rendered:true}));
    expect(states.every(m => !Object.hasOwn(m,"html") && !Object.hasOwn(m,"textContent"))).toBe(true);
  });
});
