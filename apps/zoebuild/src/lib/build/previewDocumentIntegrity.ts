/** The exact sandboxed document endpoint, not the Vite root, is the UI readiness contract. */
export function previewDocumentGatewayUrl(basePath: string): string {
  if (!basePath.startsWith("/api/build/projects/") || !basePath.endsWith("/") ||
      basePath.includes("?") || basePath.includes("#") || basePath.includes("\\")) {
    throw new Error("Invalid preview base path.");
  }
  const query = new URLSearchParams({
    __zb_preview_route: "/",
    __zb_preview_revision: "0",
  });
  return `${basePath}__zoebuild/document?${query.toString()}`;
}

export type PreviewDocumentHealth = "ready" | "expired" | "unavailable";
export function classifyPreviewDocumentHealth(
  status: number, contentType: string | null, failure: string | null,
): PreviewDocumentHealth {
  if (status === 404 || status === 410) return "expired";
  if (status === 200 && /^text\/html(?:\s*;|\s*$)/i.test(contentType ?? "") && !failure)
    return "ready";
  return "unavailable";
}
