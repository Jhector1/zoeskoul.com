import "server-only";

import type { getBuildProjectCommand } from "@zoeskoul/build-application";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { createOwnedReactPreviewBuildRequestFromSavedSource,
  ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { startTrustedReactDevelopmentPreviewAtRunner } from
  "@/lib/build/reactPreviewRunnerClient";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";

export type DevelopmentStartFailureStage =
  | "web_configuration" | "saved_source" | "actor_identity" | "runner_request";

function failureCategory(error: unknown): Readonly<{
  category: "request" | "runner_http" | "runner_transport" | "unexpected";
  status: number | null;
}> {
  if (error instanceof ReactPreviewRequestError)
    return { category: "request", status: error.status };
  if (error instanceof RunnerHttpError)
    return { category: "runner_http", status: error.status };
  if (error instanceof Error &&
      (error.message.startsWith("Runner fetch failed") ||
       error.message === "Missing RUNNER_BASE_URL" ||
       error.message.startsWith("RUNNER_BASE_URL must start")))
    return { category: "runner_transport", status: null };
  return { category: "unexpected", status: null };
}

/** Non-routed Phase 4D control-plane helper. Never accepts browser source
 * bytes. The given access must come from freshly authenticated ZoeBuild Web
 * session context; no browser actorKey/owner is accepted.
 */
export async function startOwnedReactDevelopmentPreviewFromSavedSource(input: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
  sourceVersion: unknown;
  requestId?: string;
}>) {
  let stage: DevelopmentStartFailureStage = "web_configuration";
  try {
    if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED !== "true")
      throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE",
        "Development preview startup is disabled.", 503);
    const userId = input.access.userId;
    if (!userId) throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED", "Unauthorized.", 401);
    stage = "saved_source";
    const request = await createOwnedReactPreviewBuildRequestFromSavedSource({
      access: input.access,
      buildProjectId: input.buildProjectId,
      sourceVersion: input.sourceVersion,
    });
    stage = "actor_identity";
    const actorKey = await requireRunnerActorKey(userId);
    stage = "runner_request";
    return await startTrustedReactDevelopmentPreviewAtRunner({
      actorKey, request, requestId: input.requestId,
    });
  } catch (error) {
    const diagnostic = failureCategory(error);
    console.warn("ZOEBUILD development preview start failed", {
      requestId: input.requestId ?? "unavailable",
      stage,
      category: diagnostic.category,
      status: diagnostic.status,
    });
    throw error;
  }
}
