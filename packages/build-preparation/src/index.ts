import type {
  BuildArtifactDefinition,
  BuildStackDefinition,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";
import {
  BUILD_EXECUTOR_PROTOCOL_VERSION,
  type DependencyLockBootstrapJobRequestV1,
  type DependencyLockBootstrapExecutionResponseV1,
} from "@zoeskoul/build-executor-contracts";
import { requireBuildStack } from "@zoeskoul/build-registry";
import {
  requireBuildTemplate,
  type BuildDependencyLockPolicy,
  type BuildTemplateDefinition,
} from "@zoeskoul/build-template-registry";
import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

export const BUILD_PREPARATION_VERSION = 1 as const;

export type BuildDependencyLockState =
  | "not-required"
  | "bootstrap-required"
  | "present";

export type BuildDependencyBootstrapPlan = Readonly<{
  manager: "pnpm";
  lockfilePath: "pnpm-lock.yaml";
  command: readonly ["pnpm", "install", "--lockfile-only", "--ignore-scripts"];
  trustedTemplateManifestRequired: true;
}>;

export type BuildArtifactPreparationPlan = Readonly<{
  version: typeof BUILD_PREPARATION_VERSION;
  stackId: string;
  templateId: string;
  sourceVersion: number;
  runtimeProfileId: string;
  dependencyLock: Readonly<{
    state: BuildDependencyLockState;
    manager: "pnpm" | null;
    path: string | null;
    bootstrap: BuildDependencyBootstrapPlan | null;
    installCommand: readonly string[] | null;
    trustedTemplateManifest: boolean;
  }>;
  buildCommand: readonly string[];
  preview: BuildStackDefinition["preview"];
  artifact: BuildArtifactDefinition;
  deploymentAdapterId: string;
  buildReady: boolean;
}>;

export type PrepareBuildArtifactInput = Readonly<{
  specification: ProjectSpecification;
  workspace: WorkspaceStateV2;
  sourceVersion: number;
}>;

export type BuildPreparationErrorCode =
  | "BUILD_PREPARATION_INVALID"
  | "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED"
  | "BUILD_DEPENDENCY_LOCK_INVALID";

export class BuildPreparationError extends Error {
  constructor(
    readonly code: BuildPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BuildPreparationError";
  }
}

type WorkspaceNode = WorkspaceStateV2["nodes"][number];

function requirePositiveSourceVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "ZoeBuild artifact preparation requires a positive source version.",
    );
  }
  return value;
}

function requireSafeArtifactDefinition(
  artifact: BuildArtifactDefinition | undefined,
): BuildArtifactDefinition {
  if (!artifact) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "ZoeBuild stack does not declare a publishable artifact.",
    );
  }

  if (artifact.type !== "static-directory") {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `Unsupported ZoeBuild artifact type: ${String((artifact as { type?: unknown }).type)}.`,
    );
  }

  const path = artifact.outputPath;
  if (
    typeof path !== "string" ||
    !path ||
    path.trim() !== path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "ZoeBuild artifact output path is unsafe.",
    );
  }

  if (
    path !== "." &&
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `ZoeBuild artifact output path is unsafe: ${path}.`,
    );
  }

  return artifact;
}

function workspaceTextFiles(
  workspace: WorkspaceStateV2,
): ReadonlyMap<string, string> {
  const byId = new Map<string, WorkspaceNode>();

  for (const node of workspace.nodes) {
    if (byId.has(node.id)) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `Duplicate ZoeBuild workspace node id: ${node.id}.`,
      );
    }
    byId.set(node.id, node);
  }

  const visiting = new Set<string>();
  const complete = new Set<string>();
  const paths = new Map<string, string>();

  const resolvePath = (id: string): string => {
    const cached = paths.get(id);
    if (cached) return cached;

    if (visiting.has(id)) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `ZoeBuild workspace parent cycle detected at ${id}.`,
      );
    }

    const node = byId.get(id);
    if (!node) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `Missing ZoeBuild workspace node: ${id}.`,
      );
    }

    visiting.add(id);

    let path = node.name;
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (!parent || parent.kind !== "folder") {
        throw new BuildPreparationError(
          "BUILD_PREPARATION_INVALID",
          `Invalid ZoeBuild workspace parent for ${id}.`,
        );
      }
      path = `${resolvePath(node.parentId)}/${node.name}`;
    }

    visiting.delete(id);
    complete.add(id);
    paths.set(id, path);
    return path;
  };

  for (const id of byId.keys()) {
    if (!complete.has(id)) resolvePath(id);
  }

  const files = new Map<string, string>();
  for (const node of workspace.nodes) {
    if (node.kind !== "file") continue;

    const path = paths.get(node.id);
    if (!path) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `Missing ZoeBuild workspace path for ${node.id}.`,
      );
    }

    if (files.has(path)) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `Duplicate ZoeBuild workspace file path: ${path}.`,
      );
    }

    const content = (node as WorkspaceNode & { content?: unknown }).content;
    if (typeof content !== "string") {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `ZoeBuild preparation requires text content for ${path}.`,
      );
    }

    files.set(path, content);
  }

  return files;
}

type DependencyManifest = Readonly<{
  packageManager: string | null;
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
}>;

function normalizeStringMap(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      `${label} must be an object of pinned package versions.`,
    );
  }

  const result: Record<string, string> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const version = (value as Record<string, unknown>)[key];
    if (typeof version !== "string" || !version.trim()) {
      throw new BuildPreparationError(
        "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
        `${label}.${key} must be a pinned string version.`,
      );
    }
    result[key] = version;
  }
  return result;
}

function dependencyManifest(
  content: string,
  label: string,
): DependencyManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      `${label} is not valid JSON.`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      `${label} must contain a JSON object.`,
    );
  }

  const record = parsed as Record<string, unknown>;
  const packageManager =
    typeof record.packageManager === "string"
      ? record.packageManager.trim()
      : null;

  return {
    packageManager,
    dependencies: normalizeStringMap(
      record.dependencies,
      `${label} dependencies`,
    ),
    devDependencies: normalizeStringMap(
      record.devDependencies,
      `${label} devDependencies`,
    ),
  };
}

function stableManifest(value: DependencyManifest): string {
  return JSON.stringify(value);
}

function templateDependencyManifest(
  template: BuildTemplateDefinition,
): DependencyManifest {
  const packageFile = template.files.find(
    (file) => file.path === "package.json",
  );
  if (!packageFile) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `ZoeBuild template ${template.id} declares a dependency lock without package.json.`,
    );
  }
  return dependencyManifest(
    packageFile.content,
    `Template ${template.id} package.json`,
  );
}

function assertTrustedDependencyManifest(args: {
  template: BuildTemplateDefinition;
  files: ReadonlyMap<string, string>;
}): void {
  const packageJson = args.files.get("package.json");
  if (packageJson == null) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      "ZoeBuild dependency projects require package.json.",
    );
  }

  const expected = templateDependencyManifest(args.template);
  const actual = dependencyManifest(
    packageJson,
    "Workspace package.json",
  );

  if (stableManifest(actual) !== stableManifest(expected)) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      "This source changes the registered dependency manifest. Dependency changes are not enabled yet.",
    );
  }
}

function requireFrozenInstallCommand(
  stack: BuildStackDefinition,
  policy: BuildDependencyLockPolicy,
): readonly string[] {
  const command = stack.commands.install;
  if (
    policy.manager !== "pnpm" ||
    !command ||
    command.length !== 3 ||
    command[0] !== "pnpm" ||
    command[1] !== "install" ||
    command[2] !== "--frozen-lockfile"
  ) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `ZoeBuild stack ${stack.id} does not define the required frozen-lock install contract.`,
    );
  }

  return [...command];
}

function dependencyPlan(args: {
  stack: BuildStackDefinition;
  template: BuildTemplateDefinition;
  files: ReadonlyMap<string, string>;
}): BuildArtifactPreparationPlan["dependencyLock"] {
  const policy = args.template.dependencyLock;

  if (!policy) {
    if (args.stack.commands.install?.length) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `ZoeBuild stack ${args.stack.id} installs dependencies but its template has no lock policy.`,
      );
    }

    return {
      state: "not-required",
      manager: null,
      path: null,
      bootstrap: null,
      installCommand: null,
      trustedTemplateManifest: true,
    };
  }

  assertTrustedDependencyManifest({
    template: args.template,
    files: args.files,
  });

  const installCommand = requireFrozenInstallCommand(args.stack, policy);
  const lockfile = args.files.get(policy.lockfilePath);

  if (lockfile != null) {
    if (!lockfile.trim()) {
      throw new BuildPreparationError(
        "BUILD_DEPENDENCY_LOCK_INVALID",
        `ZoeBuild dependency lock ${policy.lockfilePath} is empty.`,
      );
    }

    return {
      state: "present",
      manager: policy.manager,
      path: policy.lockfilePath,
      bootstrap: null,
      installCommand,
      trustedTemplateManifest: true,
    };
  }

  return {
    state: "bootstrap-required",
    manager: policy.manager,
    path: policy.lockfilePath,
    bootstrap: {
      manager: "pnpm",
      lockfilePath: "pnpm-lock.yaml",
      command: [
        "pnpm",
        "install",
        "--lockfile-only",
        "--ignore-scripts",
      ],
      trustedTemplateManifestRequired: true,
    },
    installCommand,
    trustedTemplateManifest: true,
  };
}

export function prepareBuildArtifactPlan(
  input: PrepareBuildArtifactInput & Readonly<{
    stack: BuildStackDefinition;
    template: BuildTemplateDefinition;
  }>,
): BuildArtifactPreparationPlan {
  const sourceVersion = requirePositiveSourceVersion(input.sourceVersion);

  if (input.specification.stackId !== input.stack.id) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `ZoeBuild specification selects ${input.specification.stackId}, not ${input.stack.id}.`,
    );
  }

  if (
    input.stack.templateId !== input.template.id ||
    !input.template.stackIds.includes(input.stack.id)
  ) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      `ZoeBuild stack/template binding is inconsistent for ${input.stack.id}.`,
    );
  }

  const files = workspaceTextFiles(input.workspace);
  const dependencyLock = dependencyPlan({
    stack: input.stack,
    template: input.template,
    files,
  });
  const artifact = requireSafeArtifactDefinition(input.stack.artifact);

  return {
    version: BUILD_PREPARATION_VERSION,
    stackId: input.stack.id,
    templateId: input.template.id,
    sourceVersion,
    runtimeProfileId: input.stack.runtimeProfileId,
    dependencyLock,
    buildCommand: [...input.stack.commands.build],
    preview: input.stack.preview,
    artifact,
    deploymentAdapterId: input.stack.deploymentAdapterId,
    buildReady: dependencyLock.state !== "bootstrap-required",
  };
}

export function prepareRegisteredBuildArtifactPlan(
  input: PrepareBuildArtifactInput,
): BuildArtifactPreparationPlan {
  const stack = requireBuildStack(input.specification.stackId);
  const template = requireBuildTemplate(stack.templateId);

  return prepareBuildArtifactPlan({
    ...input,
    stack,
    template,
  });
}

export type CreateDependencyLockBootstrapJobInput = Readonly<{
  buildProjectId: string;
  specification: ProjectSpecification;
  workspace: WorkspaceStateV2;
  sourceVersion: number;
}>;

export function createRegisteredDependencyLockBootstrapJob(
  input: CreateDependencyLockBootstrapJobInput,
): DependencyLockBootstrapJobRequestV1 {
  const buildProjectId = typeof input.buildProjectId === "string" ? input.buildProjectId.trim() : "";
  if (!buildProjectId) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "ZoeBuild dependency bootstrap requires a BuildProject id.",
    );
  }

  const plan = prepareRegisteredBuildArtifactPlan({
    specification: input.specification,
    workspace: input.workspace,
    sourceVersion: input.sourceVersion,
  });

  if (
    plan.dependencyLock.state !== "bootstrap-required" ||
    plan.dependencyLock.manager !== "pnpm" ||
    plan.dependencyLock.path !== "pnpm-lock.yaml"
  ) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_LOCK_INVALID",
      "This source version does not require trusted dependency-lock bootstrap.",
    );
  }

  const files = [...workspaceTextFiles(input.workspace)]
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    protocolVersion: BUILD_EXECUTOR_PROTOCOL_VERSION,
    operation: "dependency-lock-bootstrap",
    buildProjectId,
    sourceVersion: plan.sourceVersion,
    stackId: plan.stackId,
    templateId: plan.templateId,
    files,
  };
}

export type DependencyBootstrapFile = Readonly<{
  path: string;
  content: string;
}>;

/**
 * Defense-in-depth dependency gate for runner-side bootstrap execution.
 *
 * This deliberately reuses the same registered stack/template dependency
 * policy as preparation planning so an internal caller cannot bypass the web
 * preparation gate with a hand-crafted package.json.
 */
export function assertRegisteredDependencyBootstrapFiles(input: Readonly<{
  stackId: string;
  templateId: string;
  files: readonly DependencyBootstrapFile[];
}>): void {
  const stack = requireBuildStack(input.stackId);
  const template = requireBuildTemplate(input.templateId);

  if (
    stack.id !== "react-vite-v1" ||
    template.id !== "react-vite-v1" ||
    stack.templateId !== template.id ||
    !template.stackIds.includes(stack.id)
  ) {
    throw new BuildPreparationError(
      "BUILD_PREPARATION_INVALID",
      "Trusted dependency-lock bootstrap is not registered for this stack/template.",
    );
  }

  const files = new Map<string, string>();
  for (const file of input.files) {
    if (files.has(file.path)) {
      throw new BuildPreparationError(
        "BUILD_PREPARATION_INVALID",
        `Duplicate dependency-bootstrap file path: ${file.path}.`,
      );
    }
    files.set(file.path, file.content);
  }

  if (files.has("pnpm-lock.yaml")) {
    throw new BuildPreparationError(
      "BUILD_DEPENDENCY_LOCK_INVALID",
      "Trusted bootstrap requires pnpm-lock.yaml to be absent.",
    );
  }

  assertTrustedDependencyManifest({
    template,
    files,
  });
}

export class BuildBootstrapOutputError extends Error {
  readonly code = "BUILD_BOOTSTRAP_OUTPUT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "BuildBootstrapOutputError";
  }
}

export function applyDependencyLockBootstrapExecution(input: Readonly<{
  workspace: WorkspaceStateV2;
  buildProjectId: string;
  sourceVersion: number;
  execution: DependencyLockBootstrapExecutionResponseV1;
  nodeId: string;
  now: number;
}>): WorkspaceStateV2 {
  const buildProjectId =
    typeof input.buildProjectId === "string"
      ? input.buildProjectId.trim()
      : "";
  const nodeId =
    typeof input.nodeId === "string" ? input.nodeId.trim() : "";

  if (!buildProjectId) {
    throw new BuildBootstrapOutputError(
      "Dependency-lock bootstrap requires a BuildProject id.",
    );
  }

  if (!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) {
    throw new BuildBootstrapOutputError(
      "Dependency-lock bootstrap requires a positive source version.",
    );
  }

  if (!nodeId || input.workspace.nodes.some((node) => node.id === nodeId)) {
    throw new BuildBootstrapOutputError(
      "Dependency-lock bootstrap requires a new unique workspace node id.",
    );
  }

  if (!Number.isSafeInteger(input.now) || input.now < 0) {
    throw new BuildBootstrapOutputError(
      "Dependency-lock bootstrap requires a non-negative integer timestamp.",
    );
  }

  const result = input.execution.result;
  if (
    input.execution.ok !== true ||
    result.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION ||
    result.operation !== "dependency-lock-bootstrap" ||
    result.buildProjectId !== buildProjectId ||
    result.sourceVersion !== input.sourceVersion
  ) {
    throw new BuildBootstrapOutputError(
      "Runner dependency-lock bootstrap result does not match the requested source version.",
    );
  }

  if (result.output.path !== "pnpm-lock.yaml") {
    throw new BuildBootstrapOutputError(
      "Runner dependency-lock bootstrap returned an unsupported output path.",
    );
  }

  const content = result.output.content;
  if (
    typeof content !== "string" ||
    !content.trim() ||
    new TextEncoder().encode(content).byteLength > 2 * 1024 * 1024
  ) {
    throw new BuildBootstrapOutputError(
      "Runner dependency-lock bootstrap returned an invalid lockfile.",
    );
  }

  const files = workspaceTextFiles(input.workspace);
  for (const path of files.keys()) {
    if (path.toLocaleLowerCase() === "pnpm-lock.yaml") {
      throw new BuildBootstrapOutputError(
        "Dependency-lock bootstrap cannot overwrite an existing pnpm-lock.yaml.",
      );
    }
  }

  return {
    ...input.workspace,
    nodes: [
      ...input.workspace.nodes,
      {
        id: nodeId,
        kind: "file",
        name: "pnpm-lock.yaml",
        parentId: null,
        content,
        createdAt: input.now,
        updatedAt: input.now,
      },
    ],
  };
}
