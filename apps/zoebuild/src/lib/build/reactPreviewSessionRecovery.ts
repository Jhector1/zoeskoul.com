/** V12K11G: navigation host identity and cached preview liveness policy.
 * Does not inspect user source, consume AI credits, or weaken capability checks.
 */
export function previewViewerIdentity(buildProjectId: string, src: string | null): string {
  // A new runner preview has a new unguessable capability base URL. React must
  // discard the old viewer handshake; an HMR revision to the SAME src must not.
  return JSON.stringify([buildProjectId, src]);
}

export type CachedPreviewDocumentHealth = "ready" | "expired" | "unavailable";
export function classifyCachedPreviewDocument(
  status: number,
  contentType: string | null,
): CachedPreviewDocumentHealth {
  if (status === 404 || status === 410) return "expired";
  // A session is reusable only if the actual document endpoint returned HTML.
  // HTTP 200 JSON error envelopes must never masquerade as a ready Vite page.
  if (status >= 200 && status < 300 && /^text\/html(?:\s*;|\s*$)/i.test(contentType ?? "")) {
    return "ready";
  }
  return "unavailable";
}
