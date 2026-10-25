/** Navigation-only bridge for sandboxed React preview documents.
 * The generated application remains opaque; never grant same-origin access.
 */
export const PREVIEW_NAV_CHANNEL = "zoebuild.preview.navigation.v1";

// Runs inside a sandboxed iframe before Vite's application scripts. It has no
// access to Zoé's parent session and sends only visible route/history state.
export const PREVIEW_NAV_SCRIPT = String.raw`(function () {
  "use strict";
  var channel = "zoebuild.preview.navigation.v1";
  var base = __PREVIEW_ROOT__;
  if (!base.endsWith("/") || !location.pathname.startsWith(base)) return;
  var routes = [];
  var index = 0;
  var pending = null;
  // A React route change can remove the revision query parameter. It identifies
  // this HTML document, not the current route, so capture it once at boot.
  var documentRevision = new URLSearchParams(location.search).get("__zb_preview_revision");
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
      if (destination.origin === location.origin) {
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
  report();
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
  const script = `<script ${TAG}>${PREVIEW_NAV_SCRIPT.replace("__PREVIEW_ROOT__", JSON.stringify(basePath))}</script>`;
  return html.slice(0, insertAt) + script + html.slice(insertAt);
}
