import "server-only";

import { Prisma, type PrismaClient } from "@zoeskoul/db";
import { parseProjectSpecification } from "@zoeskoul/build-application";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { ProjectVersionConflictError, saveCodeProjectInTransaction } from "@zoeskoul/platform-server/projects/saveCodeProject";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import { historicalReactSourceMetadata } from "./restoreHistoricalReactRevision";
import { activeSavedHistoryVersion } from "./activeSavedHistoryVersion";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class SavedReactRestoreError extends Error {
  constructor(readonly code:
    "BUILD_HISTORY_STALE" | "BUILD_HISTORY_STACK_UNSUPPORTED" |
    "BUILD_RESTORE_NO_CHANGE" | "BUILD_HISTORY_SPEC_UNAVAILABLE") {
    super(code);
    this.name = "SavedReactRestoreError";
  }
}

/** Restore a COMPLETE saved React source snapshot, settings and (when captured)
 * specification. A failing historical build must not prevent restoring valid,
 * owner-authenticated saved files. Preview/build/publish are separate operations.
 * No orders, provider connections, published deployments or financial records
 * are reset. Switching selection changes the internal optimistic-concurrency head,
 * NOT the immutable saved-revision list. Only a real source edit creates history.
 */
export async function restoreSavedReactVersion(
  client: PrismaClient,
  args: Readonly<{ownerId: string; buildProjectId: string;
    expectedVersion: number; restoreVersion: number}>,
): Promise<{sourceVersion: number; changed: boolean; specificationRestored: boolean} | null> {
  return client.$transaction(async tx => {
    const current = await tx.buildProject.findFirst({
      where: {id: args.buildProjectId, stackId: "react-vite-v1",
        status: {not: "archived"}, codeProject: {ownerId: args.ownerId, archivedAt: null}},
      select: {
        id: true, stackId: true, commerceStore: {select: {id: true}},
        runs: {where: {status: {in: ["queued", "running"]}}, select: {id: true}, take: 1},
        codeProject: {select: {
          id: true, currentVersion: true, workspace: true, settings: true, meta: true,
          title: true, description: true, visibility: true, shareToken: true,
          scopeKind: true, subjectId: true, moduleId: true, assignmentId: true, scopeKey: true,
        }},
      },
    });
    if (!current) return null;
    if (current.codeProject.currentVersion !== args.expectedVersion)
      throw new SavedReactRestoreError("BUILD_HISTORY_STALE");
    if (current.runs.length)
      throw new SavedReactRestoreError("BUILD_HISTORY_STALE");
    // Never trust the browser to supply the old source or its metadata.
    const previous = await tx.codeProjectRevision.findUnique({
      where: {projectId_version: {projectId: current.codeProject.id, version: args.restoreVersion}},
      select: {snapshot: true, settings: true, meta: true},
    });
    if (!previous || !historicalReactSourceMetadata(previous.settings, previous.meta))
      throw new SavedReactRestoreError("BUILD_HISTORY_STACK_UNSUPPORTED");
    const workspace = parseBuildWorkspaceMutation(previous.snapshot);
    const savedSettings = asRecord(previous.settings);
    if (!savedSettings) throw new SavedReactRestoreError("BUILD_HISTORY_STACK_UNSUPPORTED");
    // Compare the user's *selected* saved version, not the internal CAS head.
    // A head created by restoring V2 can be numbered V15 while V2 is current.
    const activeVersion = activeSavedHistoryVersion(
      current.codeProject.currentVersion, current.codeProject.meta,
    );
    if (activeVersion === args.restoreVersion)
      throw new SavedReactRestoreError("BUILD_RESTORE_NO_CHANGE");

    // New snapshots retain specification too. Old snapshots did not, so for
    // those historical versions preserve the current spec rather than invent it.
    const historicalSpec = asRecord(savedSettings.zoeBuild)?.projectSpecification;
    let specification: ReturnType<typeof parseProjectSpecification> | null = null;
    if (historicalSpec !== undefined) {
      try {
        specification = parseProjectSpecification(historicalSpec);
      } catch {
        throw new SavedReactRestoreError("BUILD_HISTORY_SPEC_UNAVAILABLE");
      }
      if (specification.stackId !== "react-vite-v1" ||
          Boolean(specification.requirements.commerce) !== Boolean(current.commerceStore))
        throw new SavedReactRestoreError("BUILD_HISTORY_SPEC_UNAVAILABLE");
    }

    const project = current.codeProject;
    const oldMeta = asRecord(previous.meta) ?? {};
    // A version switch may select a different saved revision with identical
    // files/settings (for example V15 was itself restored from V2). This is a
    // valid selection. Do not create a duplicate source revision or a gap in
    // the revision table just to move the active-history pointer.
    const sameSource = JSON.stringify(project.workspace) === JSON.stringify(previous.snapshot) &&
      JSON.stringify(project.settings) === JSON.stringify(previous.settings);
    if (sameSource) {
      const meta = {
        ...(asRecord(project.meta) ?? {}),
        product: "zoebuild", stackId: "react-vite-v1", templateId: "react-vite-v1",
        lastMutation: "history-restore", restoredFromVersion: args.restoreVersion,
        restoredSnapshotVersion: args.expectedVersion,
        activeHistoryVersion: args.restoreVersion,
        activeHistorySourceVersion: args.expectedVersion,
      };
      const updated = await tx.codeProject.updateMany({
        where: {id: project.id, ownerId: args.ownerId, archivedAt: null,
          currentVersion: args.expectedVersion},
        data: {meta: json(meta)},
      });
      if (updated.count !== 1) throw new SavedReactRestoreError("BUILD_HISTORY_STALE");
      if (specification) {
        await tx.buildProject.update({where: {id: current.id},
          data: {specification: json(specification), specVersion: specification.version}});
      }
      // All source and dependency bytes are unchanged. The current selection
      // is persisted without mutating the historical snapshot or CAS token.
      return {sourceVersion: args.expectedVersion, changed: false,
        specificationRestored: specification !== null};
    }
    let saved;
    try {
      saved = await saveCodeProjectInTransaction(tx, {
        projectId: project.id, ownerId: args.ownerId,
        title: project.title, description: project.description,
        language: workspace.language, workspace: json(workspace),
        settings: json(savedSettings),
        meta: json({ ...oldMeta, product: "zoebuild", stackId: "react-vite-v1",
          templateId: "react-vite-v1", lastMutation: "history-restore",
          restoredFromVersion: args.restoreVersion,
          restoredSnapshotVersion: args.expectedVersion + 1,
          activeHistoryVersion: args.restoreVersion,
          activeHistorySourceVersion: args.expectedVersion + 1 }),
        entryPath: pathOf(workspace.nodes, workspace.entryFileId),
        activePath: pathOf(workspace.nodes, workspace.activeFileId),
        visibility: project.visibility, shareToken: project.shareToken,
        scope: {kind: project.scopeKind, subjectId: project.subjectId,
          moduleId: project.moduleId, assignmentId: project.assignmentId,
          scopeKey: project.scopeKey},
        // Selection is not an edit: never append a duplicate historical revision.
        // saveCodeProjectInTransaction still advances currentVersion for CAS safety.
        createRevision: false,
        createdById: args.ownerId, baseVersion: args.expectedVersion,
      });
    } catch (error) {
      if (error instanceof ProjectVersionConflictError)
        throw new SavedReactRestoreError("BUILD_HISTORY_STALE");
      throw error;
    }
    if (!saved.workspaceChanged)
      throw new SavedReactRestoreError("BUILD_RESTORE_NO_CHANGE");
    if (specification) {
      await tx.buildProject.update({where: {id: current.id},
        data: {specification: json(specification), specVersion: specification.version}});
    }
    return {sourceVersion: saved.version, changed: saved.changed,
      specificationRestored: specification !== null};
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
}
