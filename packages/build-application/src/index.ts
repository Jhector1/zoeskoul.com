import type {
  ProjectSpecification,
} from "@zoeskoul/build-contracts";
import {
  materializeRegisteredBuildProject,
} from "@zoeskoul/build-materializer";
import type {
  BuildDependencyLockPolicy,
} from "@zoeskoul/build-template-registry";
import type {
  WorkspaceStateV2,
} from "@zoeskoul/workspace-contracts";

/**
 * Provider-neutral ZoeBuild application service.
 *
 * This layer owns orchestration only. It does not know Prisma, Neon,
 * Cloudflare, Docker, Stripe, HTTP routes, or authentication frameworks.
 */

export const BUILD_PROJECT_BOOTSTRAP_VERSION = 1 as const;

export type BuildProjectSpecification = ProjectSpecification;

export type InitialBuildProjectPersistenceInput = Readonly<{
  ownerId: string;
  title: string;
  description: string | null;
  language: WorkspaceStateV2["language"];
  workspace: WorkspaceStateV2;
  entryPath: string;
  activePath: string;
  specification: BuildProjectSpecification;
  stackId: string;
  templateId: string;
  dependencyLock: BuildDependencyLockPolicy | null;
}>;

export type InitialBuildProjectPersistenceResult = Readonly<{
  codeProjectId: string;
  buildProjectId: string;
  sourceVersion: number;
}>;

export interface BuildProjectPersistence {
  createInitialBuildProject(
    input: InitialBuildProjectPersistenceInput,
  ): Promise<InitialBuildProjectPersistenceResult>;
}

export type CreateBuildProjectInput = Readonly<{
  ownerId: string;
  specification: BuildProjectSpecification;
  createdAt: number;
  persistence: BuildProjectPersistence;
}>;

export type CreateBuildProjectResult = Readonly<{
  codeProjectId: string;
  buildProjectId: string;
  sourceVersion: 1;
  stackId: string;
  templateId: string;
  dependencyLock: BuildDependencyLockPolicy | null;
}>;

function requireNonEmpty(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`ZoeBuild ${label} is required.`);
  }
  return normalized;
}

function assertInitialPersistenceResult(
  result: InitialBuildProjectPersistenceResult,
): asserts result is InitialBuildProjectPersistenceResult & {
  sourceVersion: 1;
} {
  requireNonEmpty(result.codeProjectId, "CodeProject id");
  requireNonEmpty(result.buildProjectId, "BuildProject id");

  if (result.sourceVersion !== 1) {
    throw new Error(
      `ZoeBuild initial source revision must be version 1, received ${result.sourceVersion}.`,
    );
  }
}

export class BuildProjectDefinitionError extends Error {
  readonly code = "BUILD_PROJECT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "BuildProjectDefinitionError";
  }
}

export async function createBuildProject(
  input: CreateBuildProjectInput,
): Promise<CreateBuildProjectResult> {
  const ownerId = requireNonEmpty(input.ownerId, "owner id");
  const title = requireNonEmpty(input.specification.name, "project name");
  requireNonEmpty(input.specification.stackId, "stack id");

  if (input.specification.version !== BUILD_PROJECT_BOOTSTRAP_VERSION) {
    throw new Error(
      `Unsupported ZoeBuild specification version: ${input.specification.version}.`,
    );
  }

  let materialized: ReturnType<typeof materializeRegisteredBuildProject>;
  try {
    materialized = materializeRegisteredBuildProject({
      specification: input.specification,
      createdAt: input.createdAt,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown project definition error.";
    throw new BuildProjectDefinitionError(
      `Unsupported ZoeBuild project definition: ${detail}`,
    );
  }

  const persisted = await input.persistence.createInitialBuildProject({
    ownerId,
    title,
    description: null,
    language: materialized.workspace.language,
    workspace: materialized.workspace,
    entryPath: materialized.entryPath,
    activePath: materialized.activePath,
    specification: input.specification,
    stackId: materialized.stackId,
    templateId: materialized.templateId,
    dependencyLock: materialized.dependencyLock,
  });

  assertInitialPersistenceResult(persisted);

  return {
    codeProjectId: persisted.codeProjectId,
    buildProjectId: persisted.buildProjectId,
    sourceVersion: 1,
    stackId: materialized.stackId,
    templateId: materialized.templateId,
    dependencyLock: materialized.dependencyLock,
  };
}

/**
 * Product entitlement vocabulary is deliberately provider-neutral. The web
 * adapter may later source these grants from FeatureGrant/billing without
 * coupling this package to Prisma or a payment provider.
 */
export const BUILD_ENTITLEMENT_KEYS = [
  "build_create",
  "build_ai_generate",
  "build_ai_edit",
  "build_publish",
  "build_custom_domain",
  "build_database",
  "build_auth",
  "build_storage",
  "build_backend_runtime",
  "build_extended_compute",
  "build_extended_ai",
] as const;

export type BuildEntitlementKey = (typeof BUILD_ENTITLEMENT_KEYS)[number];

export type BuildAccessSnapshot = Readonly<{
  userId: string | null;
  entitlements: readonly BuildEntitlementKey[];
}>;

export type BuildAccessPolicy = Readonly<{
  /** Free authenticated users may bootstrap source-only projects. */
  allowAuthenticatedCreate: boolean;
}>;

export const DEFAULT_BUILD_ACCESS_POLICY: BuildAccessPolicy = {
  allowAuthenticatedCreate: true,
};

export type BuildAccessDecision = Readonly<{
  authenticated: boolean;
  userId: string | null;
  canCreateProject: boolean;
  canGenerateWithAi: boolean;
  canEditWithAi: boolean;
  canPublish: boolean;
  canUseCustomDomain: boolean;
  canProvisionDatabase: boolean;
  canProvisionAuth: boolean;
  canProvisionStorage: boolean;
  canProvisionBackendRuntime: boolean;
  canUseExtendedCompute: boolean;
  canUseExtendedAi: boolean;
}>;

function normalizedBuildUserId(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function resolveBuildAccess(
  snapshot: BuildAccessSnapshot,
  policy: BuildAccessPolicy = DEFAULT_BUILD_ACCESS_POLICY,
): BuildAccessDecision {
  const userId = normalizedBuildUserId(snapshot.userId);
  const authenticated = Boolean(userId);
  const entitlements = new Set<BuildEntitlementKey>(snapshot.entitlements);
  const entitled = (key: BuildEntitlementKey) =>
    authenticated && entitlements.has(key);

  return {
    authenticated,
    userId,
    canCreateProject:
      authenticated &&
      (policy.allowAuthenticatedCreate || entitlements.has("build_create")),
    canGenerateWithAi: entitled("build_ai_generate"),
    canEditWithAi: entitled("build_ai_edit"),
    canPublish: entitled("build_publish"),
    canUseCustomDomain: entitled("build_custom_domain"),
    canProvisionDatabase: entitled("build_database"),
    canProvisionAuth: entitled("build_auth"),
    canProvisionStorage: entitled("build_storage"),
    canProvisionBackendRuntime: entitled("build_backend_runtime"),
    canUseExtendedCompute: entitled("build_extended_compute"),
    canUseExtendedAi: entitled("build_extended_ai"),
  };
}

export type BuildAccessErrorCode =
  | "BUILD_AUTH_REQUIRED"
  | "BUILD_ACCESS_DENIED";

export class BuildAccessError extends Error {
  constructor(readonly code: BuildAccessErrorCode, message: string) {
    super(message);
    this.name = "BuildAccessError";
  }
}

export function assertCanCreateBuildProject(
  snapshot: BuildAccessSnapshot,
  policy: BuildAccessPolicy = DEFAULT_BUILD_ACCESS_POLICY,
): string {
  const decision = resolveBuildAccess(snapshot, policy);
  if (!decision.authenticated || !decision.userId) {
    throw new BuildAccessError(
      "BUILD_AUTH_REQUIRED",
      "Sign in to create a ZoeBuild project.",
    );
  }
  if (!decision.canCreateProject) {
    throw new BuildAccessError(
      "BUILD_ACCESS_DENIED",
      "Your account cannot create ZoeBuild projects.",
    );
  }
  return decision.userId;
}


export function assertCanGenerateBuildWithAi(
  snapshot: BuildAccessSnapshot,
): string {
  const decision = resolveBuildAccess(snapshot);

  if (!decision.authenticated || !decision.userId) {
    throw new BuildAccessError(
      "BUILD_AUTH_REQUIRED",
      "Sign in to use ZoeBuild AI.",
    );
  }

  if (!decision.canGenerateWithAi) {
    throw new BuildAccessError(
      "BUILD_ACCESS_DENIED",
      "Your account does not have ZoeBuild AI generation access.",
    );
  }

  return decision.userId;
}


export type CreateBuildProjectCommandInput = Readonly<{
  access: BuildAccessSnapshot;
  specification: BuildProjectSpecification;
  createdAt: number;
  persistence: BuildProjectPersistence;
  policy?: BuildAccessPolicy;
}>;

export async function createBuildProjectCommand(
  input: CreateBuildProjectCommandInput,
): Promise<CreateBuildProjectResult> {
  const ownerId = assertCanCreateBuildProject(input.access, input.policy);
  return createBuildProject({
    ownerId,
    specification: input.specification,
    createdAt: input.createdAt,
    persistence: input.persistence,
  });
}

export {
  BuildSpecificationError,
  parseProjectSpecification,
} from "@zoeskoul/build-contracts";

/**
 * Provider-neutral Build project read model.
 *
 * Ownership stays authoritative on CodeProject. BuildProject is product/runtime
 * metadata attached 1:1 to that source project.
 */
export const BUILD_PROJECT_LIFECYCLE_STATUSES = [
  "draft",
  "planning",
  "generating",
  "validating",
  "ready",
  "deploying",
  "deployed",
  "failed",
  "archived",
] as const;

export type BuildProjectLifecycleStatus =
  (typeof BUILD_PROJECT_LIFECYCLE_STATUSES)[number];

export function isBuildProjectLifecycleStatus(
  value: unknown,
): value is BuildProjectLifecycleStatus {
  return (
    typeof value === "string" &&
    (BUILD_PROJECT_LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

export type BuildProjectSummaryRecord = Readonly<{
  buildProjectId: string;
  codeProjectId: string;
  title: string;
  description: string | null;
  status: BuildProjectLifecycleStatus;
  stackId: string | null;
  sourceVersion: number;
  language: WorkspaceStateV2["language"];
  updatedAt: string;
}>;

export type BuildProjectDetailRecord = BuildProjectSummaryRecord &
  Readonly<{
    entryPath: string | null;
    activePath: string | null;
    workspace: WorkspaceStateV2;
    specification: BuildProjectSpecification | null;
  }>;

export interface BuildProjectReadPort {
  listOwnedBuildProjects(ownerId: string): Promise<readonly BuildProjectSummaryRecord[]>;
  getOwnedBuildProject(
    ownerId: string,
    buildProjectId: string,
  ): Promise<BuildProjectDetailRecord | null>;
}

export function assertAuthenticatedBuildUser(
  snapshot: BuildAccessSnapshot,
): string {
  const decision = resolveBuildAccess(snapshot);
  if (!decision.authenticated || !decision.userId) {
    throw new BuildAccessError(
      "BUILD_AUTH_REQUIRED",
      "Sign in to access ZoeBuild projects.",
    );
  }
  return decision.userId;
}

export async function listBuildProjectsCommand(input: Readonly<{
  access: BuildAccessSnapshot;
  reader: BuildProjectReadPort;
}>): Promise<readonly BuildProjectSummaryRecord[]> {
  const ownerId = assertAuthenticatedBuildUser(input.access);
  return input.reader.listOwnedBuildProjects(ownerId);
}

export async function getBuildProjectCommand(input: Readonly<{
  access: BuildAccessSnapshot;
  buildProjectId: string;
  reader: BuildProjectReadPort;
}>): Promise<BuildProjectDetailRecord | null> {
  const ownerId = assertAuthenticatedBuildUser(input.access);
  const buildProjectId =
    typeof input.buildProjectId === "string" ? input.buildProjectId.trim() : "";

  if (!buildProjectId) {
    throw new BuildProjectDefinitionError("ZoeBuild project id is required.");
  }

  return input.reader.getOwnedBuildProject(ownerId, buildProjectId);
}

export type BuildSourceSavePersistenceInput = Readonly<{
  ownerId: string;
  buildProjectId: string;
  baseVersion: number;
  workspace: WorkspaceStateV2;
  clientInstanceId?: string | null;
  clientDraftUpdatedAt?: string | null;
}>;

export type BuildSourceSavePersistenceResult = Readonly<{
  sourceVersion: number;
  changed: boolean;
  workspaceChanged: boolean;
  updatedAt: string;
}>;

export interface BuildProjectSourceWritePort {
  saveOwnedBuildProjectSource(
    input: BuildSourceSavePersistenceInput,
  ): Promise<BuildSourceSavePersistenceResult | null>;
}

export class BuildSourceInputError extends Error {
  readonly code = "BUILD_SOURCE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "BuildSourceInputError";
  }
}

export class BuildSourceConflictError extends Error {
  readonly code = "BUILD_SOURCE_CONFLICT" as const;

  constructor(
    readonly conflict: Readonly<{
      serverVersion: number;
      serverUpdatedAt: string;
      title: string;
    }>,
  ) {
    super("A newer ZoeBuild source version already exists.");
    this.name = "BuildSourceConflictError";
  }
}

export async function saveBuildProjectSourceCommand(input: Readonly<{
  access: BuildAccessSnapshot;
  buildProjectId: string;
  baseVersion: number;
  workspace: WorkspaceStateV2;
  writer: BuildProjectSourceWritePort;
  clientInstanceId?: string | null;
  clientDraftUpdatedAt?: string | null;
}>): Promise<BuildSourceSavePersistenceResult | null> {
  const ownerId = assertAuthenticatedBuildUser(input.access);
  const buildProjectId =
    typeof input.buildProjectId === "string" ? input.buildProjectId.trim() : "";

  if (!buildProjectId) {
    throw new BuildSourceInputError("ZoeBuild project id is required.");
  }

  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1) {
    throw new BuildSourceInputError(
      "ZoeBuild source baseVersion must be a positive integer.",
    );
  }

  return input.writer.saveOwnedBuildProjectSource({
    ownerId,
    buildProjectId,
    baseVersion: input.baseVersion,
    workspace: input.workspace,
    clientInstanceId: input.clientInstanceId?.trim() || null,
    clientDraftUpdatedAt: input.clientDraftUpdatedAt?.trim() || null,
  });
}
