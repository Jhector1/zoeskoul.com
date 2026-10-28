import "server-only";

import { Prisma, type PrismaClient } from "@zoeskoul/db";
import { parseProjectSpecification } from "@zoeskoul/build-application";
import { createStarterProjectSpecification } from "./starterProjectSpecifications";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { ProjectVersionConflictError, saveCodeProjectInTransaction } from "@zoeskoul/platform-server/projects/saveCodeProject";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Only metadata persisted with the historical revision can establish its stack. */
export function historicalReactSourceMetadata(settings: unknown, meta: unknown) {
  const source = record(record(settings)?.zoeBuild);
  const revision = record(meta);
  if (source?.stackId !== "react-vite-v1" ||
      revision?.stackId !== "react-vite-v1" ||
      source.templateId !== "react-vite-v1") return null;
  return {
    dependencyLock: source.dependencyLock,
    templateId: "react-vite-v1" as const,
  };
}

/** The old source revision did not store BuildProject.specification.
 * Never borrow a mismatching static specification to compile React code.
 * Instead reconstruct only the registered non-commerce React baseline, and
 * require real runner verification before committing anything.
 */
export function historicReactRecoverySpecification(title: string) {
  return parseProjectSpecification(createStarterProjectSpecification("website", title));
}

export class HistoricalReactRestoreError extends Error {
  constructor(readonly code: "BUILD_HISTORY_STALE" | "BUILD_HISTORY_STACK_UNSUPPORTED" | "BUILD_HISTORY_EXTERNAL_RESOURCES") {
    super(code);
    this.name = "HistoricalReactRestoreError";
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Atomically update BOTH historical React source and authoritative stack metadata.
 * Caller must first verify the exact candidate with the trusted runner.
 * This writer rechecks owner, version and historical provenance inside a
 * SERIALIZABLE transaction, and NEVER deletes the old revision/history.
 */
export async function restoreHistoricalReactRevision(
  client: PrismaClient,
  args: Readonly<{
    ownerId: string;
    buildProjectId: string;
    expectedVersion: number;
    restoreVersion: number;
    snapshot: unknown;
    revisionSettings: unknown;
    revisionMeta: unknown;
  }>,
): Promise<{ sourceVersion: number; changed: boolean } | null> {
  const historical = historicalReactSourceMetadata(args.revisionSettings, args.revisionMeta);
  if (!historical) throw new HistoricalReactRestoreError("BUILD_HISTORY_STACK_UNSUPPORTED");
  const workspace = parseBuildWorkspaceMutation(args.snapshot);
  if (!args.ownerId.trim() || !args.buildProjectId.trim()) return null;

  return client.$transaction(async (tx) => {
    const current = await tx.buildProject.findFirst({
      where: { id: args.buildProjectId, status: { not: "archived" },
        codeProject: { ownerId: args.ownerId, archivedAt: null } },
      select: {
        id: true, stackId: true,
        resources: { select: { providerRef: true, secretRef: true, status: true } },
        deployments: { select: { providerRef: true, status: true } },
        commerceStore: { select: { _count: { select: { orders: true } },
          providerConnections: { select: { provider: true, externalAccountRef: true,
            credentialsSecretRef: true, storefrontSecretRef: true, webhookSecretRef: true } } } },
        runs: { where: { status: { in: ["queued", "running"] } }, select: { id: true }, take: 1 },
        codeProject: { select: {
          id: true, currentVersion: true, workspace: true, title: true, description: true,
          visibility: true, shareToken: true, scopeKind: true, subjectId: true,
          moduleId: true, assignmentId: true, scopeKey: true, settings: true, meta: true,
        } },
      },
    });
    if (!current) return null;
    if (current.codeProject.currentVersion !== args.expectedVersion)
      throw new HistoricalReactRestoreError("BUILD_HISTORY_STALE");
    // This migration does not remove commerce, revoke providers, unpublish sites
    // or erase payment/audit information. Block complex external obligations.
    if (current.runs.length || current.commerceStore?._count.orders ||
        current.commerceStore?.providerConnections.some(c =>
          c.provider !== "zoestore" || Boolean(c.externalAccountRef || c.credentialsSecretRef ||
            c.storefrontSecretRef || c.webhookSecretRef)) ||
        current.resources.some(r => Boolean(r.providerRef || r.secretRef) ||
          ["requested", "provisioning", "ready", "deleting"].includes(r.status)) ||
        current.deployments.some(d => Boolean(d.providerRef) ||
          ["queued", "building", "deploying"].includes(d.status))) {
      throw new HistoricalReactRestoreError("BUILD_HISTORY_EXTERNAL_RESOURCES");
    }
    // Re-read immutable source revision inside transaction; never accept
    // client-supplied source, metadata, or a fabricated revision number.
    const revision = await tx.codeProjectRevision.findFirst({
      where: { projectId: current.codeProject.id, version: args.restoreVersion },
      select: { snapshot: true, settings: true, meta: true },
    });
    if (!revision || !historicalReactSourceMetadata(revision.settings, revision.meta) ||
        JSON.stringify(revision.snapshot) !== JSON.stringify(args.snapshot) ||
        JSON.stringify(revision.settings) !== JSON.stringify(args.revisionSettings)) {
      throw new HistoricalReactRestoreError("BUILD_HISTORY_STALE");
    }
    const source = current.codeProject;
    if (JSON.stringify(source.workspace) === JSON.stringify(revision.snapshot))
      throw new HistoricalReactRestoreError("BUILD_HISTORY_STALE");
    const specification = historicReactRecoverySpecification(source.title);
    const sourceSettings = record(revision.settings);
    if (!sourceSettings) throw new HistoricalReactRestoreError("BUILD_HISTORY_STACK_UNSUPPORTED");
    const nextMeta = {
      ...(record(source.meta) ?? {}),
      product: "zoebuild", stackId: "react-vite-v1", templateId: "react-vite-v1",
      buildSpecificationVersion: specification.version,
      lastMutation: "history-restore", restoredFromVersion: args.restoreVersion,
    };
    let saved;
    try {
      saved = await saveCodeProjectInTransaction(tx, {
        projectId: source.id, ownerId: args.ownerId,
        title: source.title, description: source.description,
        language: workspace.language, workspace: json(workspace),
        settings: json(sourceSettings), meta: json(nextMeta),
        entryPath: pathOf(workspace.nodes, workspace.entryFileId),
        activePath: pathOf(workspace.nodes, workspace.activeFileId),
        visibility: source.visibility, shareToken: source.shareToken,
        scope: { kind: source.scopeKind, subjectId: source.subjectId,
          moduleId: source.moduleId, assignmentId: source.assignmentId, scopeKey: source.scopeKey },
        createRevision: true, revisionNote: `ZoeBuild restored React revision ${args.restoreVersion}`,
        createdById: args.ownerId, baseVersion: args.expectedVersion,
      });
    } catch (error) {
      if (error instanceof ProjectVersionConflictError)
        throw new HistoricalReactRestoreError("BUILD_HISTORY_STALE");
      throw error;
    }
    await tx.buildProject.update({
      where: { id: current.id },
      data: { stackId: "react-vite-v1", specVersion: specification.version,
        specification: json(specification), status: "draft" },
    });
    return { sourceVersion: saved.version, changed: saved.changed };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
