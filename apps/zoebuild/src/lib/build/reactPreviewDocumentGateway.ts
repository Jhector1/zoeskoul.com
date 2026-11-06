/**
 * The browser-facing /preview-document endpoint is a pure document gateway.
 * It serves the runner-verified Vite root after validating the requested React
 * route; the route is applied inside the unprivileged iframe before React boots.
 */
const DUMMY_ORIGIN = "https://preview.invalid";
export const PREVIEW_DOCUMENT_ROUTE_PARAM = "__zb_preview_route";
export function parseReactPreviewDocumentRequest(url: URL): string | null {
  const values = url.searchParams.getAll(PREVIEW_DOCUMENT_ROUTE_PARAM);
  if (values.length !== 1) return null;
  const raw = values[0];
  if (typeof raw !== "string" || raw.length > 2048 ||
      !raw.startsWith("/") || raw.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(raw) || /%(?:2e|2f|5c)/i.test(raw)) return null;
  const revision = url.searchParams.getAll("__zb_preview_revision");
  if (revision.length !== 1 || !/^(0|[1-9][0-9]{0,10})$/.test(revision[0]!)) return null;
  try {
    const target = new URL(raw,DUMMY_ORIGIN);
    if (target.origin !== DUMMY_ORIGIN || target.searchParams.has("__zb_preview_revision") ||
        target.searchParams.has(PREVIEW_DOCUMENT_ROUTE_PARAM)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return null; }
}

/** Translate browser content negotiation into one safe, server-owned hint.
 * Never forward the browser's raw Accept header, cookies, or credentials to
 * a generated project. Vite distinguishes a stylesheet fetch from a CSS
 * module import using Accept: text/css; both may use the same URL. */
export function previewAssetAccept(acceptHeader: string | null): "text/css" | "*/*" {
  const tokens = (acceptHeader ?? "").split(",");
  return tokens.some(token => /^\s*text\/css\s*(?:;|$)/i.test(token))
    ? "text/css" : "*/*";
}
