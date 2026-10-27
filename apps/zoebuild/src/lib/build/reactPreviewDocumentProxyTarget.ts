/**
 * The browser-only preview document route is not a runner filesystem path.
 * Route it to the *same capability root* validated at runner startup; keep
 * all non-document requests on the existing strict proxy-path normalizer.
 *
 * The caller must still validate the capability and normalize the returned
 * input. This helper never authenticates a session or forwards arbitrary URLs.
 */
export function previewDocumentProxyTarget(pathname: string, basePath: string): Readonly<{
  normalizedInput: string;
  isDocumentGateway: boolean;
}> {
  const isDocumentGateway = pathname === `${basePath}__zoebuild/document`;
  return {
    normalizedInput: isDocumentGateway ? basePath : pathname,
    isDocumentGateway,
  };
}

/**
 * The exact synthetic document resolves to the already capability-constrained
 * runner root. An asset-path normalizer may reasonably reject an empty asset
 * suffix, so it must never be invoked for this one synthetic gateway.
 *
 * All other paths, including misleading `__zoebuild/document/*` lookalikes,
 * remain subject to the unchanged strict asset-path normalizer.
 */
export function resolvePreviewDocumentProxyPath(args: Readonly<{
  target: ReturnType<typeof previewDocumentProxyTarget>;
  basePath: string;
  normalize: (input: Readonly<{ pathname: string; basePath: string }>) => string | null | undefined;
}>): string | null | undefined {
  return args.target.isDocumentGateway
    ? args.basePath
    : args.normalize({ pathname: args.target.normalizedInput, basePath: args.basePath });
}
