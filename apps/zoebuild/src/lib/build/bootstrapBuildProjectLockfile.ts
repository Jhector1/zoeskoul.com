import "server-only";

import {
  getBuildProjectCommand,
  saveBuildProjectSourceCommand,
  type BuildAccessSnapshot,
  type BuildProjectReadPort,
  type BuildProjectSourceWritePort,
  type BuildSourceSavePersistenceResult,
} from "@zoeskoul/build-application";
import type {
  DependencyLockBootstrapExecutionResponseV1,
  DependencyLockBootstrapJobRequestV1,
} from "@zoeskoul/build-executor-contracts";
import {
  BuildBootstrapOutputError,
  BuildPreparationError,
  applyDependencyLockBootstrapExecution,
  createRegisteredDependencyLockBootstrapJob,
} from "@zoeskoul/build-preparation";

export type BuildDependencyLockExecutor = (input: Readonly<{
  actorKey: string;
  request: DependencyLockBootstrapJobRequestV1;
}>) => Promise<DependencyLockBootstrapExecutionResponseV1>;

export class BuildDependencyLockExecutionError extends Error {
  readonly code = "BUILD_DEPENDENCY_LOCK_EXECUTION_FAILED" as const;

  constructor(
    message = "Trusted dependency-lock bootstrap execution failed.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BuildDependencyLockExecutionError";
  }
}

export type BuildDependencyLockBootstrapResult = Readonly<{
  bootstrappedFromVersion: number;
  outputPath: "pnpm-lock.yaml";
  source: BuildSourceSavePersistenceResult;
}>;

export async function bootstrapOwnedBuildProjectDependencyLock(input: Readonly<{
  access: BuildAccessSnapshot;
  buildProjectId: string;
  actorKey: string;
  reader: BuildProjectReadPort;
  writer: BuildProjectSourceWritePort;
  execute: BuildDependencyLockExecutor;
  nodeId: string;
  now: number;
}>): Promise<BuildDependencyLockBootstrapResult | null> {
  const project = await getBuildProjectCommand({
    access: input.access,
    buildProjectId: input.buildProjectId,
    reader: input.reader,
  });

  if (!project) return null;

  if (!project.specification) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "Project specification is unavailable.",
    );
  }

  const job = createRegisteredDependencyLockBootstrapJob({
    buildProjectId: project.buildProjectId,
    specification: project.specification,
    workspace: project.workspace,
    sourceVersion: project.sourceVersion,
  });

  let execution: DependencyLockBootstrapExecutionResponseV1;
  try {
    execution = await input.execute({
      actorKey: input.actorKey,
      request: job,
    });
  } catch (error) {
    throw new BuildDependencyLockExecutionError(
      "Trusted dependency-lock bootstrap execution failed.",
      { cause: error },
    );
  }

  const workspace = applyDependencyLockBootstrapExecution({
    workspace: project.workspace,
    buildProjectId: project.buildProjectId,
    sourceVersion: project.sourceVersion,
    execution,
    nodeId: input.nodeId,
    now: input.now,
  });

  // This baseVersion is deliberately the version sent to the runner. If the
  // user edits source while package resolution is running, the canonical
  // CodeProject writer raises BuildSourceConflictError and the runner result
  // is discarded instead of being applied over newer source.
  const source = await saveBuildProjectSourceCommand({
    access: input.access,
    buildProjectId: project.buildProjectId,
    baseVersion: project.sourceVersion,
    workspace,
    writer: input.writer,
    clientInstanceId: "zoebuild-lock-bootstrap",
    clientDraftUpdatedAt: null,
  });

  if (!source) return null;

  return {
    bootstrappedFromVersion: project.sourceVersion,
    outputPath: "pnpm-lock.yaml",
    source,
  };
}

export {
  BuildBootstrapOutputError,
  BuildPreparationError,
};
