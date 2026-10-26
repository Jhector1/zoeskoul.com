/**
 * Stable, capability-scoped HTML document gateway for a React/Vite preview.
 * The runner already verifies its Vite BASE root; the gateway fetches that same
 * document. React route selection is transmitted as data, not as a proxy path.
 */
const DUMMY_ORIGIN = "https://preview.invalid";
export const PREVIEW_DOCUMENT_SEGMENT = "__zoebuild/document";
export const PREVIEW_DOCUMENT_ROUTE_PARAM = "__zb_preview_route";
const ROOT = /^\/api\/build\/projects\/[^/]+\/preview\/preview_[0-9a-f-]{36}\/content\/[A-Za-z0-9_-]{32}\/$/i;

export function isSafePreviewPageRoute(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2048 ||
      !input.startsWith("/") || input.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(input) || /%(?:2e|2f|5c)/i.test(input)) return false;
  try {
    const url = new URL(input, DUMMY_ORIGIN);
    return url.origin === DUMMY_ORIGIN && !url.searchParams.has("__zb_preview_revision") &&
      !url.searchParams.has(PREVIEW_DOCUMENT_ROUTE_PARAM);
  } catch { return false; }
}

export function previewDocumentRoute(basePath: string, pathname: string): string {
  const root = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!pathname.startsWith(root)) return "/";
  const relative = pathname.slice(root.length);
  return relative === PREVIEW_DOCUMENT_SEGMENT || relative === "index.html" ? "/" : `/${relative}`;
}

export function withPreviewDocumentRevision(src: string, revision: number, routePath: string): string {
  const base = new URL(src, DUMMY_ORIGIN);
  if (!ROOT.test(base.pathname)) throw new Error("Invalid preview document root");
  if (!isSafePreviewPageRoute(routePath)) throw new Error("Invalid preview document route");
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid preview document revision");
  base.pathname += PREVIEW_DOCUMENT_SEGMENT;
  base.search = "";
  base.searchParams.set(PREVIEW_DOCUMENT_ROUTE_PARAM, routePath);
  base.searchParams.set("__zb_preview_revision", String(revision));
  base.hash = "";
  return `${base.pathname}${base.search}`;
}
