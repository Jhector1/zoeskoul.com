import "server-only";

import type { getBuildProjectCommand } from "@zoeskoul/build-application";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { createOwnedReactPreviewBuildRequestFromSavedSource,
  ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { startTrustedReactDevelopmentPreviewAtRunner } from
  "@/lib/build/reactPreviewRunnerClient";

/** Non-routed Phase 4D control-plane helper. Never accepts browser source
 * bytes. The given access must come from freshly authenticated ZoeBuild Web
 * session context; no browser actorKey/owner is accepted.
 */
export async function startOwnedReactDevelopmentPreviewFromSavedSource(input: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
  sourceVersion: unknown;
}>) {
  if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED !== "true")
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE",
      "Development preview startup is disabled.", 503);
  const userId = input.access.userId;
  if (!userId) throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED", "Unauthorized.", 401);
  const request = await createOwnedReactPreviewBuildRequestFromSavedSource(input);
  const actorKey = await requireRunnerActorKey(userId);
  return startTrustedReactDevelopmentPreviewAtRunner({actorKey, request});
}
