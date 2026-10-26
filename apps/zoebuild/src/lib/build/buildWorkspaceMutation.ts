import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { invalidZoeReactPageSource } from "./zoeReactPageGraphValidation";
import {
  type IdeWorkspacePolicy,
  validateWorkspaceState,
} from "@zoeskoul/learner-workspace/lib/ide/workspacePolicy";
import {
  WORKSPACE_DENIED_PATH_SEGMENTS,
  isSafeWorkspaceRelativePath,
  resolveWorkspaceFileCapability,
} from "@zoeskoul/code-contracts";

export const BUILD_SOURCE_WORKSPACE_POLICY: IdeWorkspacePolicy = {
  canCreateFiles: true,
  canCreateFolders: true,
  canRenameNodes: true,
  canDeleteNodes: true,
  canMoveNodes: true,
  canUploadFiles: true,
  canUploadBinaryFiles: true,
  maxImportFiles: 50,
  maxUploadFileBytes: 5 * 1024 * 1024,
  maxWorkspaceBytes: 8 * 1024 * 1024,
  maxNodes: 500,
  maxFiles: 300,
  maxDepth: 12,
  maxFileContentBytes: 2 * 1024 * 1024,
  maxStdinBytes: 64 * 1024,
};

export class BuildWorkspaceMutationError extends Error {
  readonly code = "BUILD_WORKSPACE_INVALID" as const;

  constructor(readonly issues: readonly string[]) {
    super(
      issues.length
        ? issues.join(" ")
        : "Invalid ZoeBuild workspace payload.",
    );
    this.name = "BuildWorkspaceMutationError";
  }
}

type RawNode = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pathSegmentIssue(name: unknown): string | null {
  if (typeof name !== "string") return "Workspace node name must be a string.";
  if (!name || name !== name.trim()) {
    return "Workspace node names must be non-empty and trimmed.";
  }
  if (
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    return `Unsafe workspace node name: ${JSON.stringify(name)}.`;
  }
  return null;
}

function validateParentGraph(nodes: RawNode[]): string[] {
  if (nodes.length > BUILD_SOURCE_WORKSPACE_POLICY.maxNodes) {
    return [
      `Workspace limit reached: max ${BUILD_SOURCE_WORKSPACE_POLICY.maxNodes} nodes.`,
    ];
  }

  const byId = new Map<string, RawNode>();
  const siblingKeys = new Set<string>();

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const id = typeof node.id === "string" ? node.id : "";
    if (!id) return [`Workspace node ${index} is missing a valid id.`];
    if (byId.has(id)) return [`Workspace node id "${id}" is duplicated.`];

    const nameIssue = pathSegmentIssue(node.name);
    if (nameIssue) return [nameIssue];

    const parentId =
      node.parentId == null
        ? null
        : typeof node.parentId === "string"
          ? node.parentId
          : "__invalid_parent__";

    if (parentId === "__invalid_parent__") {
      return [`Workspace node "${id}" has an invalid parentId.`];
    }

    const siblingKey = `${parentId ?? "<root>"}\u001f${String(node.name).toLocaleLowerCase()}`;
    if (siblingKeys.has(siblingKey)) {
      return [
        `Workspace siblings may not share the same name: ${String(node.name)}.`,
      ];
    }
    siblingKeys.add(siblingKey);
    byId.set(id, node);
  }

  const visiting = new Set<string>();
  const complete = new Set<string>();

  const visit = (id: string): string | null => {
    if (complete.has(id)) return null;
    if (visiting.has(id)) {
      return `Workspace parent cycle detected at node "${id}".`;
    }

    const node = byId.get(id);
    if (!node) return null;

    visiting.add(id);
    const parentId =
      typeof node.parentId === "string" ? node.parentId : null;

    if (parentId) {
      const parent = byId.get(parentId);
      if (!parent) {
        return `Workspace node "${id}" references a missing parent.`;
      }
      if (parent.kind !== "folder") {
        return `Workspace node "${id}" parent must be a folder.`;
      }

      const issue = visit(parentId);
      if (issue) return issue;
    }

    visiting.delete(id);
    complete.add(id);
    return null;
  };

  for (const id of byId.keys()) {
    const issue = visit(id);
    if (issue) return [issue];
  }

  return [];
}

function buildNodePaths(nodes: RawNode[]): Map<string, string> {
  const byId = new Map<string, RawNode>();
  for (const node of nodes) {
    if (typeof node.id === "string") byId.set(node.id, node);
  }

  const memo = new Map<string, string>();

  const pathOf = (id: string): string => {
    const cached = memo.get(id);
    if (cached) return cached;

    const node = byId.get(id);
    if (!node) return "";

    const name = String(node.name);
    const parentId =
      typeof node.parentId === "string" ? node.parentId : null;
    const path = parentId ? `${pathOf(parentId)}/${name}` : name;
    memo.set(id, path);
    return path;
  };

  for (const id of byId.keys()) pathOf(id);
  return memo;
}

function validateFullPaths(nodes: RawNode[]): string[] {
  const paths = buildNodePaths(nodes);
  const denied = new Set(
    WORKSPACE_DENIED_PATH_SEGMENTS.map((value) => value.toLocaleLowerCase()),
  );

  for (const node of nodes) {
    const id = String(node.id ?? "");
    const path = paths.get(id) ?? "";
    if (!isSafeWorkspaceRelativePath(path)) {
      return [`Unsafe workspace path: ${path || id}.`];
    }

    const segments = path.split("/").map((part) => part.toLocaleLowerCase());
    if (segments.some((segment) => denied.has(segment))) {
      return [`Workspace control path is not allowed: ${path}.`];
    }

    if (node.kind === "file" && !resolveWorkspaceFileCapability(path)) {
      return [`Unsupported or unsafe workspace file path: ${path}.`];
    }
  }

  return [];
}

export function parseBuildWorkspaceMutation(
  value: unknown,
): WorkspaceStateV2 {
  const workspace = asRecord(value);
  if (!workspace) {
    throw new BuildWorkspaceMutationError(["Workspace must be an object."]);
  }

  if (!Array.isArray(workspace.nodes)) {
    throw new BuildWorkspaceMutationError([
      "Workspace nodes must be an array.",
    ]);
  }

  const nodes = workspace.nodes
    .map((node) => asRecord(node))
    .filter((node): node is RawNode => Boolean(node));

  if (nodes.length !== workspace.nodes.length) {
    throw new BuildWorkspaceMutationError([
      "Every workspace node must be an object.",
    ]);
  }

  const graphIssues = validateParentGraph(nodes);
  if (graphIssues.length) {
    throw new BuildWorkspaceMutationError(graphIssues);
  }

  const pathIssues = validateFullPaths(nodes);
  if (pathIssues.length) {
    throw new BuildWorkspaceMutationError(pathIssues);
  }

  // Manual source saves and AI-approved edits share the same route graph guard.
  // Reject a page importing itself or accidentally containing the generated router.
  const mappedPaths = buildNodePaths(nodes);
  for (const node of nodes) {
    if (node.kind !== "file" || typeof node.content !== "string") continue;
    const filePath = mappedPaths.get(String(node.id)) ?? "";
    const issue = invalidZoeReactPageSource(filePath,node.content);
    if (issue) throw new BuildWorkspaceMutationError([issue]);
  }

  const sharedIssues = validateWorkspaceState(
    workspace,
    BUILD_SOURCE_WORKSPACE_POLICY,
  );
  if (sharedIssues.length) {
    throw new BuildWorkspaceMutationError(sharedIssues);
  }

  if (
    typeof workspace.leftPct !== "number" ||
    !Number.isFinite(workspace.leftPct) ||
    workspace.leftPct < 0 ||
    workspace.leftPct > 100
  ) {
    throw new BuildWorkspaceMutationError([
      "Workspace leftPct must be a finite percentage between 0 and 100.",
    ]);
  }

  return workspace as unknown as WorkspaceStateV2;
}
