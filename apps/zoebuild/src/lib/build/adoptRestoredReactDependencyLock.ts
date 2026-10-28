import "server-only";

import { Prisma, type PrismaClient } from "@zoeskoul/db";
import { parseProjectSpecification } from "@zoeskoul/build-application";
import {
  PROJECT_DEPENDENCY_APPROVAL_PATH,
  canonicalProjectDependencyManifest,
  prepareRegisteredBuildArtifactPlan,
  sealProjectDependencies,
} from "@zoeskoul/build-preparation";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { ProjectVersionConflictError, saveCodeProjectInTransaction } from "@zoeskoul/platform-server/projects/saveCodeProject";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import { activeSavedHistoryVersion } from "./activeSavedHistoryVersion";

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function json(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export class AutoRestoreDependenciesError extends Error {
  constructor(readonly code:
    "BUILD_HISTORY_STALE" | "BUILD_RESTORE_DEPENDENCIES_UNVERIFIED" |
    "BUILD_RESTORE_DEPENDENCY_APPROVAL_PRESENT" | "BUILD_RESTORE_DEPENDENCIES_UNSUPPORTED") {
    super(code);
    this.name = "AutoRestoreDependenciesError";
  }
}

/**
 * The owner has explicitly selected a SAVED history revision. Recover its
 * exact pinned package.json + pnpm-lock.yaml when an older revision predates
 * the signed ZoeBuild approval file. Never rewrite either dependency file.
 * Installing remains the runner's scriptless, frozen-lock sandbox policy.
 * No approval is replaced: an invalid existing seal is a hard failure.
 */
export async function adoptRestoredReactDependencyLock(client: PrismaClient, args: Readonly<{
  ownerId: string; buildProjectId: string; expectedVersion: number;
}>): Promise<{sourceVersion: number; status: "adopted" | "lock-missing"} | null> {
  return client.$transaction(async tx => {
    const owned = await tx.buildProject.findFirst({
      where: {id: args.buildProjectId, stackId: "react-vite-v1", status: {not: "archived"},
        codeProject: {ownerId: args.ownerId, archivedAt: null}},
      select: {id: true, specification: true, codeProject: {select: {
        id: true, currentVersion: true, workspace: true, settings: true, meta: true,
        title: true, description: true, visibility: true, shareToken: true,
        scopeKind: true, subjectId: true, moduleId: true, assignmentId: true, scopeKey: true,
      }}},
    });
    if (!owned) return null;
    const cp = owned.codeProject;
    const meta = obj(cp.meta);
    if (cp.currentVersion !== args.expectedVersion ||
        meta?.lastMutation !== "history-restore" ||
        meta?.restoredSnapshotVersion !== args.expectedVersion)
      throw new AutoRestoreDependenciesError("BUILD_HISTORY_STALE");
    const historyVersion = activeSavedHistoryVersion(args.expectedVersion, cp.meta);
    const previous = await tx.codeProjectRevision.findUnique({
      where: {projectId_version: {projectId: cp.id, version: historyVersion}},
      select: {snapshot: true, settings: true},
    });
    if (!previous) throw new AutoRestoreDependenciesError("BUILD_RESTORE_DEPENDENCIES_UNVERIFIED");
    const saved = parseBuildWorkspaceMutation(previous.snapshot);
    const workspace = parseBuildWorkspaceMutation(cp.workspace);
    const root = (ws: typeof workspace, name: string) => {
      const node = ws.nodes.find(n => n.kind === "file" && n.parentId === null && n.name === name);
      // Array.find alone leaves this typed as FSNode (which also includes folders).
      // Narrow the return value explicitly before comparing historical file bytes.
      return node?.kind === "file" ? node : undefined;
    };
    const packageNode = root(workspace, "package.json");
    const lockNode = root(workspace, "pnpm-lock.yaml");
    const approvedNode = root(workspace, PROJECT_DEPENDENCY_APPROVAL_PATH);
    if (!packageNode || packageNode.kind !== "file" ||
        packageNode.content !== root(saved, "package.json")?.content ||
        lockNode?.content !== root(saved, "pnpm-lock.yaml")?.content ||
        JSON.stringify(cp.settings) !== JSON.stringify(previous.settings))
      throw new AutoRestoreDependenciesError("BUILD_RESTORE_DEPENDENCIES_UNVERIFIED");
    if (approvedNode) throw new AutoRestoreDependenciesError("BUILD_RESTORE_DEPENDENCY_APPROVAL_PRESENT");
    if (!lockNode || lockNode.kind !== "file" || !lockNode.content.trim()) {
      return {sourceVersion: args.expectedVersion, status: "lock-missing"};
    }
    // No version ranges, package-manager overrides or unpinned dependencies.
    try { canonicalProjectDependencyManifest(packageNode.content); }
    catch { throw new AutoRestoreDependenciesError("BUILD_RESTORE_DEPENDENCIES_UNSUPPORTED"); }
    const secret = process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET ?? "";
    // Server-issued signature covers the ORIGINAL manifest and lock bytes.
    // The historical snapshot is immutable; only the new current head gains
    // the missing ZoeBuild authorization file.
    const now = Date.now();
    const sealed = {
      ...workspace,
      nodes: [...workspace.nodes, {
        id: crypto.randomUUID(), kind: "file" as const, parentId: null,
        name: PROJECT_DEPENDENCY_APPROVAL_PATH,
        content: sealProjectDependencies({
          projectId: args.buildProjectId, packageJson: packageNode.content,
          lockfile: lockNode.content, secret,
        }),
        createdAt: now, updatedAt: now,
      }],
    };
    const specification = parseProjectSpecification(owned.specification);
    const plan = prepareRegisteredBuildArtifactPlan({
      buildProjectId: args.buildProjectId,
      specification, workspace: sealed, sourceVersion: args.expectedVersion,
    });
    if (plan.dependencyLock.state !== "present")
      throw new AutoRestoreDependenciesError("BUILD_RESTORE_DEPENDENCIES_UNSUPPORTED");
    let result;
    try {
      result = await saveCodeProjectInTransaction(tx, {
        projectId: cp.id, ownerId: args.ownerId,
        title: cp.title, description: cp.description, language: sealed.language,
        workspace: json(sealed), settings: json(cp.settings),
        meta: json({...(meta ?? {}), product: "zoebuild", stackId: "react-vite-v1",
          lastMutation: "history-restore", restoredSnapshotVersion: args.expectedVersion + 1,
          restoredFromVersion: historyVersion, activeHistoryVersion: historyVersion,
          activeHistorySourceVersion: args.expectedVersion + 1}),
        entryPath: pathOf(sealed.nodes, sealed.entryFileId),
        activePath: pathOf(sealed.nodes, sealed.activeFileId),
        visibility: cp.visibility, shareToken: cp.shareToken,
        scope: {kind: cp.scopeKind, subjectId: cp.subjectId, moduleId: cp.moduleId,
          assignmentId: cp.assignmentId, scopeKey: cp.scopeKey},
        // A generated authorization seal is not a new user-saved version.
        createRevision: false,
        createdById: args.ownerId, baseVersion: args.expectedVersion,
      });
    } catch (error) {
      if (error instanceof ProjectVersionConflictError)
        throw new AutoRestoreDependenciesError("BUILD_HISTORY_STALE");
      throw error;
    }
    if (result.version !== args.expectedVersion + 1)
      throw new AutoRestoreDependenciesError("BUILD_HISTORY_STALE");
    return {sourceVersion: result.version, status: "adopted"};
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
}
