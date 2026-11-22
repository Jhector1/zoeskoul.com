import "server-only";

import {
  BuildAccessError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";
import {
  BuildPreparationError,
  createRegisteredProductionBuildJob,
  prepareRegisteredBuildArtifactPlan,
} from "@zoeskoul/build-preparation";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { prisma } from "@zoeskoul/platform-server/prisma";

import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import {
  BuildWorkspaceMutationError,
  parseBuildWorkspaceMutation,
} from "@/lib/build/buildWorkspaceMutation";
import { previewWorkspaceMatchesSavedSource } from "@/lib/build/previewSourceIdentity";

export class ReactPreviewRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReactPreviewRequestError";
  }
}

export function parseReactPreviewId(value: unknown) {
  const previewId = typeof value === "string" ? value.trim() : "";
  if (!/^preview_[0-9a-f-]{36}$/i.test(previewId)) {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_INVALID",
      "Invalid preview id.",
      400,
    );
  }
  return previewId;
}

export async function requireOwnedReactPreviewProject(args: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
}>) {
  let project;
  try {
    project = await getBuildProjectCommand({
      access: args.access,
      buildProjectId: args.buildProjectId,
      reader: createPrismaBuildProjectReader(prisma),
    });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      throw new ReactPreviewRequestError(
        error.code,
        error.message,
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }
    throw error;
  }

  if (!project) {
    throw new ReactPreviewRequestError(
      "BUILD_PROJECT_NOT_FOUND",
      "Project not found.",
      404,
    );
  }

  const specification =
    project.specification;

  if (
    project.stackId !== "tanstack-start-v1" ||
    !specification ||
    specification.stackId !== "tanstack-start-v1"
  ) {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_UNSUPPORTED",
      "Trusted live preview requires a registered TanStack Start project.",
      409,
    );
  }

  return {
    ...project,
    specification,
  };
}

export async function createOwnedReactPreviewBuildRequest(args: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
  sourceVersion: unknown;
  workspace: unknown;
}>) {
  const project = await requireOwnedReactPreviewProject({
    access: args.access,
    buildProjectId: args.buildProjectId,
  });

  if (
    !Number.isSafeInteger(args.sourceVersion) ||
    Number(args.sourceVersion) !== project.sourceVersion
  ) {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_SOURCE_CONFLICT",
      `Preview source is stale. Reload source v${project.sourceVersion}.`,
      409,
    );
  }

  let workspace: WorkspaceStateV2;
  try {
    workspace = parseBuildWorkspaceMutation(args.workspace);
  } catch (error) {
    if (error instanceof BuildWorkspaceMutationError) {
      throw new ReactPreviewRequestError(
        error.code,
        "Invalid preview workspace.",
        400,
      );
    }
    throw error;
  }

  if (!previewWorkspaceMatchesSavedSource(project.workspace,workspace)) {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_SOURCE_CONFLICT",
      `Preview source bytes do not match saved source v${project.sourceVersion}.`,
      409,
    );
  }

  let previewPlan;
  try {
    previewPlan = prepareRegisteredBuildArtifactPlan({
      buildProjectId: project.buildProjectId,
      specification: project.specification,
      workspace,
      sourceVersion: project.sourceVersion,
    });
  } catch (error) {
    if (error instanceof BuildPreparationError) {
      throw new ReactPreviewRequestError(error.code, error.message, 409);
    }
    throw error;
  }

  if (previewPlan.dependencyLock.state === "bootstrap-required") {
    throw new ReactPreviewRequestError(
      "BUILD_DEPENDENCY_LOCK_INVALID",
      "TanStack preview requires one-time trusted dependency preparation.",
      409,
    );
  }

  try {
    return createRegisteredProductionBuildJob({
      buildProjectId: project.buildProjectId,
      specification: project.specification,
      workspace,
      sourceVersion: project.sourceVersion,
    });
  } catch (error) {
    if (error instanceof BuildPreparationError) {
      throw new ReactPreviewRequestError(error.code, error.message, 409);
    }
    throw error;
  }
}

/** Phase 4A: server-side construction of an authoritative saved preview revision.
 *
 * Unlike the browser-start contract, callers MUST NOT provide workspace bytes.
 * This method re-reads the owned project and consumes ONLY its persisted source.
 * A future Runner update authority must call it again AFTER a workspace write
 * to reject a superseded DB revision before publishing a development lease.
 *
 * IMPORTANT: this is only an authority primitive; it does not create a
 * development lease, expose an update route, or authorize HMR transport.
 */
export async function createOwnedReactPreviewBuildRequestFromSavedSource(args: Readonly<{
  access: Parameters<typeof getBuildProjectCommand>[0]["access"];
  buildProjectId: string;
  sourceVersion: unknown;
}>) {
  const project = await requireOwnedReactPreviewProject({
    access: args.access,
    buildProjectId: args.buildProjectId,
  });

  if (
    !Number.isSafeInteger(args.sourceVersion) ||
    args.sourceVersion !== project.sourceVersion
  ) {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_SOURCE_CONFLICT",
      `Preview source is stale. Reload source v${project.sourceVersion}.`,
      409,
    );
  }

  // A saved source is still data, not trusted executable code. Parse the
  // persisted workspace with the same bounded workspace validator as start.
  let workspace: WorkspaceStateV2;
  try {
    workspace = parseBuildWorkspaceMutation(project.workspace);
  } catch {
    throw new ReactPreviewRequestError(
      "BUILD_PREVIEW_SOURCE_CONFLICT",
      "Saved preview workspace is invalid.",
      409,
    );
  }

  let previewPlan;
  try {
    previewPlan = prepareRegisteredBuildArtifactPlan({
      buildProjectId: project.buildProjectId,
      specification: project.specification,
      workspace,
      sourceVersion: project.sourceVersion,
    });
  } catch (error) {
    if (error instanceof BuildPreparationError) {
      throw new ReactPreviewRequestError(error.code, error.message, 409);
    }
    throw error;
  }

  if (previewPlan.dependencyLock.state === "bootstrap-required") {
    throw new ReactPreviewRequestError(
      "BUILD_DEPENDENCY_LOCK_INVALID",
      "TanStack preview requires one-time trusted dependency preparation.",
      409,
    );
  }

  try {
    return createRegisteredProductionBuildJob({
      buildProjectId: project.buildProjectId,
      specification: project.specification,
      workspace,
      sourceVersion: project.sourceVersion,
    });
  } catch (error) {
    if (error instanceof BuildPreparationError) {
      throw new ReactPreviewRequestError(error.code, error.message, 409);
    }
    throw error;
  }
}
