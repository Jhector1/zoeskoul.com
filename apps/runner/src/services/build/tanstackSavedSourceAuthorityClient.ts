import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";

/** Private Runner -> ZoeBuild callback for the Phase 3F transaction's pre-
 * write and post-write checks. Not currently installed in a runtime route.
 * No local fallback or cached authorization is permitted on network failure.
 */
export async function assertCurrentTanstackSavedSourceAtZoeBuild(
  actorKey: string,
  request: ProductionBuildJobRequestV1,
  options: Readonly<{
    endpoint?: string;
    secret?: string;
    fetchImpl?: typeof fetch;
  }> = {},
): Promise<void> {
  const endpoint = options.endpoint ?? process.env.ZOEBUILD_PREVIEW_AUTHORITY_URL;
  const secret = options.secret ?? process.env.ZOEBUILD_PREVIEW_AUTHORITY_SHARED_SECRET;
  if (!endpoint || !secret || secret.length < 32 ||
      !/^u:[0-9a-f]{64}$/.test(actorKey) ||
      request.operation !== "production-build" ||
      request.stackId !== "tanstack-start-v1" ||
      request.templateId !== "tanstack-start-v1")
    throw new Error("Saved-source authority is not configured.");
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error("Invalid saved-source authority endpoint."); }
  if (!(["https:", "http:"].includes(url.protocol)) ||
      url.username || url.password || url.hash || url.search ||
      url.pathname !== "/api/internal/build/preview-source-authority")
    throw new Error("Invalid saved-source authority endpoint.");

  try {
    const res = await (options.fetchImpl ?? fetch)(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zoebuild-preview-authority": secret,
      },
      body: JSON.stringify({ actorKey, request }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok || (await res.json() as {ok?:unknown})?.ok !== true)
      throw new Error("Saved-source authority rejected the request.");
  } catch {
    throw new Error("Saved-source authority rejected the request.");
  }
}
