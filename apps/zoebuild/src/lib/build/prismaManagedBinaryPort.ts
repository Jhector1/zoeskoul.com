import "server-only";

/**
 * AI4B4E2C: ZoeBuild-only durable data-layer adapter for the managed binary
 * revision boundary. NOT connected to the live /source route yet.
 *
 * This transaction is for *already verified* stripped workspaces. It does not
 * authenticate a browser, upload files, or return R2 keys to the client.
 * Every active consumer MUST hydrate the saved source before use.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@zoeskoul/db";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import {
  ManagedBinaryRevisionError,
  validateManagedBinaryRevision,
  type ManagedBinaryRevision,
  type ManagedBinaryScope,
} from "./managedBinaryRevision";
import type { ManagedBinaryAtomicSourcePort } from "./managedBinaryCommit";
import type { ManagedBinaryStoredSnapshot } from "./managedBinaryWorkspace";
import {assertCommittedManagedBinaryIntents,generalManagedProjectEligible} from "./managedBinaryPrismaPolicy";
import {activeSavedHistoryVersion} from "./activeSavedHistoryVersion";

// This is still an immutable source revision, not a user-visible saved version.
export const MANAGED_DEPENDENCY_PREPARATION_NOTE = "ZoeBuild internal managed dependency preparation";
export const MANAGED_HISTORY_RESTORE_NOTE = "ZoeBuild internal managed history restore";
export const MANAGED_INTERNAL_HISTORY_NOTES = [MANAGED_DEPENDENCY_PREPARATION_NOTE, MANAGED_HISTORY_RESTORE_NOTE];
export function isManagedInternalHistoryNote(note: string | null): boolean {
  return note !== null && MANAGED_INTERNAL_HISTORY_NOTES.includes(note);
}

function fail(code: string): never { throw new ManagedBinaryRevisionError(code); }
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function assertStrippedWorkspace(
  snapshot: ManagedBinaryStoredSnapshot<WorkspaceStateV2>,
  revision: ManagedBinaryRevision,
  expectedVersion: number,
): WorkspaceStateV2 {
  if (snapshot.format !== "zoebuild-r2-binary-snapshot-v1" ||
      snapshot.sourceVersion !== expectedVersion ||
      !snapshot.workspace || !Array.isArray(snapshot.workspace.nodes)) {
    return fail("MANAGED_DB_SNAPSHOT_INVALID");
  }
  const workspace = snapshot.workspace;
  const byId = new Map(workspace.nodes.map(node => [node.id, node]));
  for (const binding of revision.bindings) {
    const node = byId.get(binding.nodeId);
    if (!node || node.kind !== "file" || node.binary !== undefined ||
        pathOf(workspace.nodes, node.id) !== binding.path) {
      return fail("MANAGED_DB_SNAPSHOT_BINDING_MISMATCH");
    }
  }
  if (!pathOf(workspace.nodes, workspace.entryFileId) ||
      !pathOf(workspace.nodes, workspace.activeFileId)) {
    return fail("MANAGED_DB_SNAPSHOT_ENTRY_INVALID");
  }
  return workspace;
}

/**
 * CAS update, source-history insert, private manifest insert, intent-state
 * finalization all occur in ONE Prisma transaction. The object bytes were
 * already uploaded privately and durably journaled by the staging adapter.
 */
export function createPrismaManagedBinaryPort(
  client: PrismaClient,
  options: Readonly<{internalDependencyPreparation?:boolean; historicalRestoreVersion?:number;general?:boolean}> = {},
): ManagedBinaryAtomicSourcePort<WorkspaceStateV2> {
  return {
    async commitOwnedRevision(prepared) {
      const scope = prepared.scope;
      const revision = validateManagedBinaryRevision(
        prepared.revision, scope, prepared.sourceVersion,
      );
      if (!Number.isSafeInteger(prepared.expectedBaseVersion) ||
          prepared.expectedBaseVersion < 1 ||
          prepared.sourceVersion !== prepared.expectedBaseVersion + 1) {
        return fail("MANAGED_DB_CAS_VERSION_INVALID");
      }
      const workspace = assertStrippedWorkspace(prepared.snapshot, revision, prepared.sourceVersion);
      return client.$transaction(async tx => {
        const project = await tx.buildProject.findFirst({
          where: {id: scope.buildProjectId, status: {not: "archived"},
            codeProject: {ownerId: scope.ownerId, archivedAt: null}},
          select: {id: true, stackId: true, codeProject: {select: {
            id: true, ownerId: true, currentVersion: true, language: true,
            settings: true, meta: true, updatedAt: true, visibility:true, shareToken:true,
          }}},
        });
        if (!project) return fail("MANAGED_DB_PROJECT_NOT_FOUND");
        if (options.general && !generalManagedProjectEligible(project)) return fail("MANAGED_DB_PROJECT_SCOPE_INVALID");
        if (project.codeProject.currentVersion !== prepared.expectedBaseVersion) {
          return {kind: "conflict" as const};
        }
        if (workspace.language !== project.codeProject.language) {
          return fail("MANAGED_DB_LANGUAGE_MISMATCH");
        }
        const intentIds = [...new Set(revision.bindings.map(item => item.assetId))];
        const intents = intentIds.length
          ? await tx.buildManagedBinaryUploadIntent.findMany({where: {
              ownerId: scope.ownerId, buildProjectId: scope.buildProjectId,
              assetId: {in: intentIds},
            }})
          : [];
        const newIds = assertCommittedManagedBinaryIntents(
          revision.bindings, scope, prepared.expectedBaseVersion, intents,
        );
        let preparedMeta: Prisma.InputJsonValue | undefined;
        const restoreVersion = options.historicalRestoreVersion;
        if (restoreVersion !== undefined) {
          if (options.internalDependencyPreparation || project.stackId !== "tanstack-start-v1" ||
              project.codeProject.visibility !== "private" || project.codeProject.shareToken !== null ||
              !Number.isSafeInteger(restoreVersion) || restoreVersion < 1 ||
              restoreVersion >= prepared.expectedBaseVersion || newIds.length ||
              activeSavedHistoryVersion(prepared.expectedBaseVersion, project.codeProject.meta) === restoreVersion) {
            return fail("MANAGED_HISTORY_RESTORE_INVALID");
          }
          const running = await tx.buildRun.count({where:{buildProjectId:scope.buildProjectId,status:{in:["queued","running"]}}});
          if (running) return fail("MANAGED_HISTORY_ACTIVE_OPERATION");
          const target = await tx.codeProjectRevision.findUnique({where:{projectId_version:{
            projectId:project.codeProject.id, version:restoreVersion}},select:{snapshot:true,settings:true,meta:true,note:true}});
          const manifest = await tx.buildManagedBinaryRevision.findUnique({where:{buildProjectId_sourceVersion:{
            buildProjectId:scope.buildProjectId,sourceVersion:restoreVersion}}});
          const currentManifest = await tx.buildManagedBinaryRevision.findUnique({where:{buildProjectId_sourceVersion:{
            buildProjectId:scope.buildProjectId,sourceVersion:prepared.expectedBaseVersion}}});
          if (!target || !manifest || manifest.ownerId !== scope.ownerId || currentManifest?.ownerId !== scope.ownerId ||
              isManagedInternalHistoryNote(target.note) ||
              !Object.prototype.hasOwnProperty.call(record(target.meta),"managedBinaryRevisionDigest") ||
              !isDeepStrictEqual(target.settings,project.codeProject.settings) ||
              !isDeepStrictEqual(target.snapshot,workspace)) {
            return fail("MANAGED_HISTORY_RESTORE_TARGET_CHANGED");
          }
          const historical=validateManagedBinaryRevision(manifest.manifest as unknown as ManagedBinaryRevision,scope,restoreVersion);
          if (!isDeepStrictEqual(historical.bindings,revision.bindings)) return fail("MANAGED_HISTORY_RESTORE_BINDINGS_CHANGED");
          preparedMeta=json({...record(project.codeProject.meta),lastMutation:"history-restore",
            restoredFromVersion:restoreVersion,restoredSnapshotVersion:prepared.sourceVersion,
            activeHistoryVersion:restoreVersion,activeHistorySourceVersion:prepared.sourceVersion});
        }
        if (options.internalDependencyPreparation) {
          // An internal preparation only runs on an already-managed source head
          // and always retains the existing visible history selection.
          const selected = activeSavedHistoryVersion(prepared.expectedBaseVersion, project.codeProject.meta);
          const visible = await tx.codeProjectRevision.findUnique({where: {projectId_version: {
            projectId: project.codeProject.id, version: selected}}, select: {note:true}});
          const priorManifest = await tx.buildManagedBinaryRevision.findUnique({where: {buildProjectId_sourceVersion: {
            buildProjectId: scope.buildProjectId, sourceVersion: prepared.expectedBaseVersion}}, select: {ownerId:true}});
          if (!visible || isManagedInternalHistoryNote(visible.note) || priorManifest?.ownerId !== scope.ownerId || newIds.length) {
            return fail("MANAGED_DEPENDENCY_PREPARATION_BASE_INVALID");
          }
          preparedMeta = json({...record(project.codeProject.meta), activeHistoryVersion: selected,
            activeHistorySourceVersion: prepared.sourceVersion});
        }
        const entryPath = pathOf(workspace.nodes, workspace.entryFileId);
        const activePath = pathOf(workspace.nodes, workspace.activeFileId);
        const workspaceHash = digest({
          language: project.codeProject.language,
          entryPath,
          activePath,
          workspace,
          settings: project.codeProject.settings ?? null,
        });
        // Even a pure image replacement changes the revision's manifest, so
        // increment sourceVersion without depending on stripped-JSON equality.
        const updated = await tx.codeProject.updateMany({
          where: {id: project.codeProject.id, ownerId: scope.ownerId,
            archivedAt: null, currentVersion: prepared.expectedBaseVersion},
          data: {currentVersion: prepared.sourceVersion,
            workspace: json(workspace), workspaceHash,
            entryPath, activePath, lastOpenedAt: new Date(),
            ...(preparedMeta === undefined ? {} : {meta: preparedMeta})},
        });
        if (updated.count !== 1) return {kind: "conflict" as const};
        await tx.codeProjectRevision.create({data: {
          projectId: project.codeProject.id,
          version: prepared.sourceVersion,
          workspaceHash,
          snapshot: json(workspace),
          settings: project.codeProject.settings ?? Prisma.JsonNull,
          note: restoreVersion !== undefined ? MANAGED_HISTORY_RESTORE_NOTE : options.internalDependencyPreparation ? MANAGED_DEPENDENCY_PREPARATION_NOTE : "ZoeBuild managed R2 source save",
          meta: json({
            ...record(project.codeProject.meta),
            baseVersion: prepared.expectedBaseVersion,
            managedBinaryRevisionDigest: digest(revision),
          }),
          createdById: scope.ownerId,
        }});
        await tx.buildManagedBinaryRevision.create({data: {
          buildProjectId: scope.buildProjectId,
          sourceVersion: prepared.sourceVersion,
          ownerId: scope.ownerId,
          manifest: json(revision),
        }});
        for (const assetId of newIds) {
          const marked = await tx.buildManagedBinaryUploadIntent.updateMany({
            where: {assetId, ownerId: scope.ownerId, buildProjectId: scope.buildProjectId,
              plannedBaseVersion: prepared.expectedBaseVersion, state: "uploaded"},
            data: {state: "committed"},
          });
          if (marked.count !== 1) return fail("MANAGED_DB_ASSET_INTENT_CONFLICT");
        }
        return {kind: "committed" as const, sourceVersion: prepared.sourceVersion};
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    },

    async readOwnedRevision(input) {
      const scope = input.scope;
      return client.$transaction(async tx => {
        const project = await tx.buildProject.findFirst({
          where: {id: scope.buildProjectId, status: {not: "archived"},
            codeProject: {ownerId: scope.ownerId, archivedAt: null}},
          select: {codeProject: {select: {id: true, currentVersion: true, workspace: true}}},
        });
        if (!project || input.sourceVersion > project.codeProject.currentVersion ||
            !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) return null;
        const source = await tx.codeProjectRevision.findUnique({
          where: {projectId_version: {projectId: project.codeProject.id,
            version: input.sourceVersion}}, select: {snapshot: true, meta: true},
        });
        // Read the actual head for the current version; legacy head-only saves
        // may have no history record (or a distinct editor-state snapshot).
        const current = input.sourceVersion === project.codeProject.currentVersion;
        const workspace = current ? project.codeProject.workspace : source?.snapshot;
        if (!workspace) return null;
        const managed = await tx.buildManagedBinaryRevision.findUnique({
          where: {buildProjectId_sourceVersion: {
            buildProjectId: scope.buildProjectId, sourceVersion: input.sourceVersion,
          }},
        });
        const metadata = source?.meta;
        const marked = Boolean(metadata && typeof metadata === "object" &&
          Object.prototype.hasOwnProperty.call(metadata, "managedBinaryRevisionDigest"));
        if (!managed) {
          if (marked) return fail("MANAGED_DB_MARKED_MANIFEST_MISSING");
          return {kind: "legacy" as const, workspace: workspace as unknown as WorkspaceStateV2};
        }
        if (!marked) return fail("MANAGED_DB_MANIFEST_MARKER_MISSING");
        if (!source || (current && !isDeepStrictEqual(source.snapshot, workspace))) {
          return fail("MANAGED_DB_SOURCE_HISTORY_MISMATCH");
        }
        if (managed.ownerId !== scope.ownerId) {
          return fail("MANAGED_DB_OWNER_MISMATCH");
        }
        const revision = validateManagedBinaryRevision(
          managed.manifest as unknown as ManagedBinaryRevision,
          scope, input.sourceVersion,
        );
        return {kind: "managed" as const,
          revision,
          snapshot: {format: "zoebuild-r2-binary-snapshot-v1" as const,
            sourceVersion: input.sourceVersion,
            workspace: workspace as unknown as WorkspaceStateV2},
        };
      }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
    },
  };
}
