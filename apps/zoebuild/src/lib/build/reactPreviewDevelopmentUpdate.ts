import "server-only";

import type { getBuildProjectCommand } from "@zoeskoul/build-application";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
  createOwnedReactPreviewBuildRequestFromSavedSource,
  parseReactPreviewId,
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import { updateTrustedReactDevelopmentPreviewAtRunner } from
  "@/lib/build/reactPreviewRunnerClient";

/** Private control plane: accepts only the selected revision and a preview ID.
 * No browser-supplied code, lockfile, workspace, actor key or container path.
 * The Runner checks lease ownership and re-attests the saved source before
 * AND after the serialized Docker update. A failed post-write check quarantines
 * that development lease. Immutable previews cannot enter this path.
 */
export async function updateOwnedReactDevelopmentPreviewFromSavedSource(input: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
  previewId: unknown;
  sourceVersion: unknown;
}>): Promise<Readonly<{ action: "updated"; sourceVersion: number }>> {
  if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_UPDATE_ENABLED !== "true")
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE",
      "Development preview updates are disabled.", 503);
  const userId = input.access.userId;
  if (!userId)
    throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED", "Unauthorized.", 401);
  const previewId = parseReactPreviewId(input.previewId);
  const request = await createOwnedReactPreviewBuildRequestFromSavedSource({
    access: input.access,
    buildProjectId: input.buildProjectId,
    sourceVersion: input.sourceVersion,
  });
  const actorKey = await requireRunnerActorKey(userId);
  const response = await updateTrustedReactDevelopmentPreviewAtRunner({
    actorKey, previewId, request,
  });
  // The Runner response is not an authority for the user's selected revision.
  if (response.action !== "updated" ||
      response.sourceVersion !== request.sourceVersion)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_RUNNER_FAILED",
      "Development preview revision was not confirmed.", 502);
  return {action:"updated", sourceVersion:request.sourceVersion};
}
