/** Navigation-only bridge for sandboxed React preview documents.
 * The generated application remains opaque; never grant same-origin access.
 */
export const PREVIEW_NAV_CHANNEL = "zoebuild.preview.navigation.v1";

// Runs inside a sandboxed iframe before Vite's application scripts. It has no
// access to Zoé's parent session and sends only visible route/history state.
export const PREVIEW_NAV_SCRIPT = String.raw`(function () {
  "use strict";
  var channel = "zoebuild.preview.navigation.v1";
  // Observe a stable, server-authored script element rather than assuming
  // document.currentScript survives a browser's execution/CSP timing. A known
  // initialization failure is reported once; never silently abandon the toolbar.
  var documentRevision = new URLSearchParams(location.search).get("__zb_preview_revision");
  function bootstrapFailure(reason) {
    window.parent.postMessage({ channel: channel, type: "bootstrap",
      status: "failed", reason: reason, revision: documentRevision }, "*");
  }
  var script = document.currentScript || document.querySelector("script[data-zoebuild-navigation-bridge]");
  if (!script) { bootstrapFailure("script-missing"); return; }
  var suppliedRoot = script.getAttribute("data-zoebuild-preview-root");
  var source = script.getAttribute("src");
  if (!source || !suppliedRoot) { bootstrapFailure("configuration-missing"); return; }
  var currentAddress = new URL(location.href);
  var scriptAddress = new URL(source, location.href);
  var scriptSuffix = "__zoebuild/navigation.js";
  if (scriptAddress.origin !== currentAddress.origin ||
      !/^\/api\/build\/projects\/[^/]+\/preview\/preview_[a-f\d-]+\/content\/[A-Za-z0-9_-]{32}\/__zoebuild\/navigation\.js$/.test(scriptAddress.pathname)) {
    bootstrapFailure("script-address-invalid"); return;
  }
  var base = scriptAddress.pathname.slice(0, -scriptSuffix.length);
  if (suppliedRoot !== base || !location.pathname.startsWith(base)) {
    bootstrapFailure("document-root-invalid"); return;
  }
  // The authenticated document gateway serves the exact runner-verified
  // Vite root. The browser-selected route is inert query data until this bridge
  // restores the canonical SPA URL BEFORE React's module script executes.
  if (location.pathname === base + "__zoebuild/document") {
    var params = new URLSearchParams(location.search);
    var routesRequested = params.getAll("__zb_preview_route");
    var revisionRequested = params.getAll("__zb_preview_revision");
    var requested = routesRequested[0];
    if (routesRequested.length !== 1 || revisionRequested.length !== 1 ||
        !requested || requested.length > 2048 || !requested.startsWith("/") ||
        requested.startsWith("//") || /%(?:2e|2f|5c)/i.test(requested) ||
        /[\\\u0000-\u001f\u007f]/.test(requested)) {
      bootstrapFailure("document-route-invalid"); return;
    }
    var target = new URL(requested, "https://preview.invalid");
    if (target.origin !== "https://preview.invalid" ||
        target.searchParams.has("__zb_preview_revision") ||
        target.searchParams.has("__zb_preview_route")) {
      bootstrapFailure("document-route-invalid"); return;
    }
    target.searchParams.set("__zb_preview_revision", revisionRequested[0]);
    history.replaceState(history.state, "", base + target.pathname.slice(1) + target.search + target.hash);
  }
  var routes = [];
  var index = 0;
  var pending = null;
  // A React route change can remove the revision query parameter. It identifies
  // this HTML document, not the current route, so capture it once at boot.
  function route() {
    if (!location.pathname.startsWith(base)) return null;
    var params = new URLSearchParams(location.search);
    params.delete("__zb_preview_revision");
    var suffix = params.toString();
    return "/" + location.pathname.slice(base.length) + (suffix ? "?" + suffix : "") + location.hash;
  }
  routes.push(route());
  var lastReport = null;
  function report(force) {
    var current = route();
    if (current === null) return;
    var rootElement = document.getElementById("root");
    var rendered = Boolean(rootElement && rootElement.childElementCount > 0);
    var revision = documentRevision;
    var fingerprint = current + "|" + index + "|" + routes.length + "|" + rendered;
    if (!force && fingerprint === lastReport) return;
    lastReport = fingerprint;
    window.parent.postMessage({ channel: channel, type: "state", basePath: base, route: current,
      canGoBack: index > 0, canGoForward: index < routes.length - 1,
      rendered: rendered, revision: revision }, "*");
  }
  var push = history.pushState;
  var replace = history.replaceState;
  history.pushState = function () {
    var previous = route();
    var result = push.apply(this, arguments);
    var current = route();
    if (current !== null && previous !== current) {
      routes = routes.slice(0, index + 1);
      routes.push(current);
      index++;
    }
    report();
    return result;
  };
  history.replaceState = function () {
    var result = replace.apply(this, arguments);
    var current = route();
    if (current !== null) routes[index] = current;
    report();
    return result;
  };
  window.addEventListener("popstate", function () {
    var current = route();
    if (current === null) return;
    var candidate = pending === "back" ? index - 1 : pending === "forward" ? index + 1 : -1;
    if (candidate >= 0 && candidate < routes.length && routes[candidate] === current) {
      index = candidate;
    } else {
      var found = routes.lastIndexOf(current);
      if (found >= 0) index = found;
      else { routes = [current]; index = 0; }
    }
    pending = null;
    report();
  });
  window.addEventListener("hashchange", function () { report(true); });
  window.addEventListener("pageshow", function () { report(true); });
  window.addEventListener("load", function () { report(true); });
  // Report that React has actually mounted, not merely that Vite served HTML.
  // Root contents are not inspected or sent to the parent.
  var renderObserver = new MutationObserver(function () { report(); });
  renderObserver.observe(document.documentElement, { childList: true, subtree: true });
  // React can replace history hooks; reconcile URL drift without flooding parent.
  window.addEventListener("click", function () { setTimeout(report, 0); }, true);
  setInterval(function () { if (!document.hidden) report(); }, 1000);
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.channel !== channel || data.type !== "command") return;
    if (data.action === "probe") report(true);
    if (data.action === "navigate" && typeof data.route === "string" &&
        data.route.length < 1024 && /^\/(?!\/)[a-zA-Z0-9\-/]*(?:\?[^#]*)?(?:#.*)?$/.test(data.route) &&
        !/%(?:2e|2f|5c)/i.test(data.route)) {
      var destination = new URL(data.route, location.href);
      // A sandboxed document can serialize location.origin as "null".
      // Compare the *URL addresses*, never the opaque security origin.
      if (destination.origin === new URL(location.href).origin) {
        var next = base + destination.pathname.slice(1) + destination.search + destination.hash;
        if (location.pathname + location.search + location.hash !== next) {
          history.pushState({}, "", next);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        report(true);
      }
    }
    if (data.action === "back" && index > 0) {
      pending = "back";
      history.back();
    }
    if (data.action === "forward" && index < routes.length - 1) {
      pending = "forward";
      history.forward();
    }
  });
  // Explicit acknowledgement even if the first route report precedes the
  // parent listener. The parent can also ask for a new report using "probe".
  window.parent.postMessage({ channel: channel, type: "bootstrap", status: "installed",
    basePath: base, revision: documentRevision }, "*");
  report(true);
})();`;

const TAG = "data-zoebuild-navigation-bridge";
const MAX_HTML_CHARS = 2_000_000;

/** Idempotent and narrowly scoped to HTML, never JavaScript, API, or assets. */
export function injectReactPreviewNavigationBridge(html: string, basePath: string): string {
  if (html.length > MAX_HTML_CHARS || html.includes(TAG) ||
      !/^\/api\/build\/projects\/[^/]+\/preview\/preview_[a-f\d-]+\/content\/[A-Za-z0-9_-]{32}\/$/.test(basePath)) {
    return html;
  }
  const openingHead = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!openingHead || openingHead.index === undefined) return html;
  const insertAt = openingHead.index + openingHead[0].length;
  const script = `<script ${TAG} data-zoebuild-preview-root="${basePath}" src="${basePath}__zoebuild/navigation.js"></script>`;
  return html.slice(0, insertAt) + script + html.slice(insertAt);
}
