/** Minimal, deterministic Vite HTML-readiness predicate.
 * Successful HTTP transport alone is not proof of a renderable document.
 */
export type ReactPreviewDocumentProbe = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyBase64: string;
}>;

export function isValidReactPreviewReadyDocument(response: ReactPreviewDocumentProbe): boolean {
  if (response.status !== 200 ||
      !/^text\/html(?:\s*;|$)/i.test(response.headers["content-type"] ?? "")) return false;
  if (!response.bodyBase64 || response.bodyBase64.length > 6_000_000) return false;
  const body = Buffer.from(response.bodyBase64, "base64").toString("utf8");
  // Refuse empty or error payloads even if a proxy mistakenly labels them HTML.
  return /<html(?:\s|>)/i.test(body) && /<head(?:\s|>)/i.test(body) &&
    /<body(?:\s|>)/i.test(body);
}
