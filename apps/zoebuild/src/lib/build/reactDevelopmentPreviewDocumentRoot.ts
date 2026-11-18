/**
 * A development preview document is an opaque, token-scoped browser-read URL.
 * This is deliberately distinct from the immutable preview-document gateway.
 * No absolute origins, fragments, query strings or external routes are allowed.
 */
const DEV_DOCUMENT_ROOT = /^\/api\/build\/projects\/[A-Za-z0-9_-]{1,128}\/preview\/preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/development\/content\/(?:dpv1\.[A-Za-z0-9_-]{32,1000}|dpg1\.[A-Za-z0-9_-]{43})\/$/i;
const PAGE = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/;

/** Route a possible development path to a fail-closed renderer rather than the
 * legacy immutable helper, which throws during React render for these URLs. */
export function isDevelopmentPreviewCandidate(src: unknown): boolean {
  return typeof src === "string" && src.startsWith("/api/build/projects/") &&
    src.includes("/development/content/");
}
export function isTrustedDevelopmentPreviewRoot(src: unknown): src is string {
  return typeof src === "string" && src.length <= 1700 && DEV_DOCUMENT_ROOT.test(src);
}
export function developmentPreviewDocumentUrl(root: string, page: string): string {
  if (!isTrustedDevelopmentPreviewRoot(root)) throw new Error("Untrusted development preview root");
  if (typeof page !== "string" || !PAGE.test(page) || page.length > 512)
    throw new Error("Untrusted development preview route");
  return root + (page === "/" ? "" : page.slice(1));
}
