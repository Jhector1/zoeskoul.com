import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const bridgeSource = readFileSync(resolve(repo, "apps/zoebuild/src/lib/build/reactPreviewNavigationBridge.ts"), "utf8");
const viewerSource = readFileSync(resolve(repo, "packages/learner-workspace/src/runner/components/RemoteWebPreview.tsx"), "utf8");
const js = bridgeSource.match(/export const PREVIEW_NAV_SCRIPT = String\.raw`([\s\S]*?)`;/)?.[1];
assert.ok(js, "Preview navigation script must be present");
// Parsing cannot require a real browser or provider/network operations.
assert.doesNotThrow(() => new Function(js));

const base = "/api/build/projects/cmva2y8l2000221dl6w20b5cm/preview/preview_0d5524f1-b9b1-4165-a986-b40db0de774a/content/hc0yaQh_mkTxk3nnFA5FYsnNzaZwDPmP/";
function bootstrapScenario({ throwOnRestore = false, badScript = false } = {}) {
  const messages = [];
  const url = new URL("https://zoe.example" + base + "__zoebuild/document?__zb_preview_route=%2Fapproach&__zb_preview_revision=5");
  const script = {
    getAttribute(name) {
      if (name === "src") return badScript ? "https://evil.invalid/external.js" : base + "__zoebuild/navigation.js";
      if (name === "data-zoebuild-preview-root") return base;
      return null;
    }
  };
  const location = { href: url.href, pathname: url.pathname, search: url.search, hash: "" };
  const parent = { postMessage(value) { messages.push(value); } };
  const sandbox = {
    location, URL, URLSearchParams,
    document: { currentScript: script, querySelector: () => null, documentElement: {}, getElementById: () => ({childElementCount:1}) },
    history: {
      state: null,
      replaceState(_state, _title, target) {
        if (throwOnRestore) throw new DOMException("History denied", "SecurityError");
        const updated = new URL(target, "https://zoe.example");
        location.href = updated.href;
        location.pathname = updated.pathname;
        location.search = updated.search;
        location.hash = updated.hash;
      },
      pushState() {},back() {},forward() {}
    },
    DOMException,
    MutationObserver: class { observe() {} },
    window: { parent, addEventListener() {} },
    setInterval() {}, setTimeout() {}
  };
  runInNewContext(js, sandbox, { timeout:1000 });
  return messages;
}

test("route-restore rejection yields a bounded bootstrap error instead of silent abort", () => {
  const messages = bootstrapScenario({ throwOnRestore:true });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, "zoebuild.preview.navigation.v1");
  assert.equal(messages[0].type, "bootstrap");
  assert.equal(messages[0].status, "failed");
  assert.equal(messages[0].reason, "document-route-restore-failed");
  assert.equal(messages[0].revision, "5");
  assert.ok(!JSON.stringify(messages).includes("SecurityError"));
});
test("normal route restore still installs the bridge and reports rendered state", () => {
  const messages = bootstrapScenario();
  assert.equal(messages.filter(m => m.type === "bootstrap" && m.status === "installed").length,1);
  assert.equal(messages.find(m => m.type === "state")?.rendered, true);
  assert.equal(messages.find(m => m.type === "state")?.route, "/approach");
});
test("untrusted script origin cannot install a render attestation", () => {
  const messages = bootstrapScenario({badScript:true});
  assert.equal(messages.length,1);
  assert.equal(messages[0].reason,"script-address-invalid");
});
test("host only displays diagnostic for exact current iframe and reason allowlist", () => {
  assert.match(viewerSource, /event\.origin !== "null"/);
  assert.match(viewerSource, /frame\?\.contentWindow === event\.source/);
  assert.match(viewerSource, /value\.revision !== expectedRevision/);
  assert.match(viewerSource,/source === iframeSrc/);
  assert.match(viewerSource,/"document-route-restore-failed"/);
  assert.match(viewerSource,/setRenderProblem\("Browser refused to restore the sandboxed preview route/);
  assert.match(viewerSource,/if \(!value\.rendered\) return;/);
  assert.doesNotMatch(viewerSource,/allow-same-origin/);
});
test("sandbox keeps opaque-origin isolation and HTML gateway only injects a classic script", () => {
  assert.match(viewerSource,/sandbox="allow-scripts allow-forms allow-modals"/);
  assert.match(bridgeSource,/html\.slice\(0, insertAt\) \+ script \+ html\.slice\(insertAt\)/);
  assert.doesNotMatch(bridgeSource, /document\.cookie|localStorage|sessionStorage/);
});
