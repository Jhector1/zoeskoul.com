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
  sealProjectDependencies,
  canonicalProjectDependencyManifest,
  PROJECT_DEPENDENCY_APPROVAL_PATH,
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
  /** Set only after explicit owner approval. Allows regeneration of an existing lock. */
  reconcileExisting?: boolean;
  expectedSourceVersion?: number;
  /** Exact pinned, reviewed package choices. No arbitrary source files or commands. */
  desiredDependencies?: Readonly<{
    dependencies: Readonly<Record<string, string>>;
    devDependencies: Readonly<Record<string, string>>;
  }>;
  approvalSecret?: string;
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

  if (input.reconcileExisting || input.desiredDependencies) {
    if (input.expectedSourceVersion !== project.sourceVersion) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        "Dependency approval requires the current saved source version.",
      );
    }
  }

  const secret = input.approvalSecret ?? process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET ?? "";
  const rootFile = (name: string) => project.workspace.nodes.find(
    (node) => node.kind === "file" && node.parentId === null && node.name === name,
  );
  const packageNode = rootFile("package.json");
  if (!packageNode || packageNode.kind !== "file") {
    throw new BuildPreparationError("BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", "Missing root package.json.");
  }
  const oldLockNode = rootFile("pnpm-lock.yaml");
  if (oldLockNode && !input.reconcileExisting) {
    throw new BuildPreparationError("BUILD_DEPENDENCY_LOCK_INVALID", "Dependency lock already exists; request an owner-approved reconciliation.");
  }

  let packageContent = packageNode.content;
  if (input.desiredDependencies) {
    let pkg: Record<string, unknown>;
    try { pkg = JSON.parse(packageContent) as Record<string, unknown>; } catch {
      throw new BuildPreparationError("BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", "Invalid package.json.");
    }
    pkg.dependencies = input.desiredDependencies.dependencies;
    pkg.devDependencies = input.desiredDependencies.devDependencies;
    packageContent = JSON.stringify(pkg, null, 2) + "\n";
  }
  // Independently enforce pinned, registry-only manifest policy BEFORE minting.
  canonicalProjectDependencyManifest(packageContent);

  const approvalNode = rootFile(PROJECT_DEPENDENCY_APPROVAL_PATH);
  const approvalId = approvalNode?.id ?? `${input.nodeId}-approval`;
  const previousCreatedAt = approvalNode?.createdAt ?? input.now;
  const bootstrapSeal = sealProjectDependencies({
    projectId: project.buildProjectId,
    packageJson: packageContent,
    secret,
  });

  const preparedWorkspace = {
    ...project.workspace,
    // The old lock node is being regenerated with a new id; keep tab and
    // active-path references valid across the single canonical source save.
    openTabs: project.workspace.openTabs.filter((id) => id !== oldLockNode?.id),
    activeFileId: project.workspace.activeFileId === oldLockNode?.id
      ? packageNode.id : project.workspace.activeFileId,
    entryFileId: project.workspace.entryFileId === oldLockNode?.id
      ? packageNode.id : project.workspace.entryFileId,
    nodes: [
      ...project.workspace.nodes.filter((node) =>
        node.id !== packageNode.id &&
        node.id !== approvalNode?.id &&
        !(node.kind === "file" && node.parentId === null && node.name === "pnpm-lock.yaml"),
      ),
      { ...packageNode, content: packageContent, updatedAt: input.now },
      {
        id: approvalId,
        kind: "file" as const,
        parentId: null,
        name: PROJECT_DEPENDENCY_APPROVAL_PATH,
        content: bootstrapSeal,
        createdAt: previousCreatedAt,
        updatedAt: input.now,
      },
    ],
  };

  const job = createRegisteredDependencyLockBootstrapJob({
    buildProjectId: project.buildProjectId,
    specification: project.specification,
    workspace: preparedWorkspace,
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
    workspace: preparedWorkspace,
    buildProjectId: project.buildProjectId,
    sourceVersion: project.sourceVersion,
    execution,
    nodeId: input.nodeId,
    now: input.now,
  });

  const lockfile = workspace.nodes.find(
    (node) => node.kind === "file" && node.parentId === null && node.name === "pnpm-lock.yaml",
  );
  if (!lockfile || lockfile.kind !== "file") {
    throw new BuildBootstrapOutputError("Dependency bootstrap did not produce a lockfile.");
  }
  const oldLockTabIndex = oldLockNode
    ? project.workspace.openTabs.indexOf(oldLockNode.id) : -1;
  const updatedTabs = [...workspace.openTabs];
  if (oldLockTabIndex !== -1) {
    updatedTabs.splice(Math.min(oldLockTabIndex, updatedTabs.length), 0, lockfile.id);
  }
  const sealedWorkspace = {
    ...workspace,
    openTabs: updatedTabs,
    activeFileId: project.workspace.activeFileId === oldLockNode?.id
      ? lockfile.id : workspace.activeFileId,
    nodes: workspace.nodes.map((node) => node.id === approvalId && node.kind === "file"
      ? {
        ...node,
        content: sealProjectDependencies({
          projectId: project.buildProjectId,
          packageJson: packageContent,
          lockfile: lockfile.content,
          secret,
        }),
        updatedAt: input.now,
      }
      : node),
  };

  // This baseVersion is deliberately the version sent to the runner. If the
  // user edits source while package resolution is running, the canonical
  // CodeProject writer raises BuildSourceConflictError and the runner result
  // is discarded instead of being applied over newer source.
  const source = await saveBuildProjectSourceCommand({
    access: input.access,
    buildProjectId: project.buildProjectId,
    baseVersion: project.sourceVersion,
    workspace: sealedWorkspace,
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
