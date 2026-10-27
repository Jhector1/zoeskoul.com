import { createHash, randomUUID } from "node:crypto";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import { isZoeStaticPagePath, linkZoeStaticPageInHome } from "./zoeStaticPageLinks";
import { isZoeStandalonePageInstruction } from "./zoeAssistantEditIntent";
import {isZoeReactPageSourcePath,ZOE_REACT_ROUTER_MARKER} from "./zoeReactRouteEdits";
import { invalidZoeReactPageSource } from "./zoeReactPageGraphValidation";

/** E15B is intentionally scoped to editable UI/content files, not application controls. */
const EDITABLE_SOURCE = /(?:^|\/)(?!.*(?:\.env|\.secret|\.lock))(?:[a-zA-Z0-9_.-]+\.)?(?:tsx|jsx|css|html|md)$/i;
export const ZOE_EDIT_MAX_CONTEXT_CHARS = 48_000;
export const ZOE_EDIT_MAX_PROMPT_CHARS = 8_000;
export const ZOE_STATIC_HOME_LINK_MAX_CHARS = 64_000;
const ZOE_REACT_COMPONENT_SOURCE_PATH = /^src\/components\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z][A-Za-z0-9_-]*\.(?:tsx|jsx|css)$/;
/** Source modules Zoé may organize under an authorized React/Vite src tree. */
const ZOE_REACT_ARCH_SOURCE = /^src\/(?:hooks|data|layouts|routes|utils|lib|context|providers|services)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z][A-Za-z0-9_-]*\.(?:ts|tsx|jsx|css|json)$/;
function reactArchitectureFile(path: string): boolean {
  return ZOE_REACT_ARCH_SOURCE.test(path) &&
    (!path.endsWith(".json") || path.startsWith("src/data/"));
}
const ZOE_REACT_NESTED_PAGE_SOURCE = /^src\/pages\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z][A-Za-z0-9_-]*\.(?:ts|tsx)$/;
function safeNewReactFile(path: string): boolean {
  return isZoeReactPageSourcePath(path) || ZOE_REACT_COMPONENT_SOURCE_PATH.test(path) ||
    reactArchitectureFile(path) || ZOE_REACT_NESTED_PAGE_SOURCE.test(path);
}


/** Resolve each workspace path once. Large, owner-authorized refactors must not
 * repeatedly traverse the entire tree for every edited file. */
function sourcePaths(workspace: WorkspaceStateV2): Map<string, string> {
  const byId = new Map(workspace.nodes.map(node => [node.id, node] as const));
  const memo = new Map<string, string>();
  const pending = new Set<string>();
  function resolve(id: string): string {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || pending.has(id)) throw new ZoeEditInputError("BUILD_WORKSPACE_INVALID", "Invalid source tree.");
    pending.add(id);
    const parent = node.parentId ? resolve(node.parentId) : "";
    pending.delete(id);
    const path = parent ? `${parent}/${node.name}` : node.name;
    memo.set(id, path);
    return path;
  }
  for (const node of workspace.nodes) resolve(node.id);
  return memo;
}

function isReactWorkspace(workspace: WorkspaceStateV2, paths: Map<string, string>): boolean {
  const entries = new Set(workspace.nodes.filter(node => node.kind === "file")
    .map(node => paths.get(node.id)));
  return entries.has("src/main.tsx") && entries.has("src/App.tsx");
}

export type ZoeSourceEdit = Readonly<{
  path: string;
  beforeSha256: string;
  content: string;
  /** New file only; cannot overwrite an existing source path. */
  create?: true;
}>;
export type ZoeSourceEditProposal = Readonly<{
  baseVersion: number;
  summary: string;
  edits: readonly (ZoeSourceEdit & { beforePreview: string; afterPreview: string })[];
  buildVerification?: Readonly<{
    state: "passed" | "failed" | "not-run";
    sourceVersion: number;
    snapshotSha256: string | null;
    artifactSha256: string | null;
    reason: string;
    message: string;
    browser: "not-run";
  }>;
}>;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function listZoeEditableFiles(workspace: WorkspaceStateV2, activePath: string | null) {
  const paths = sourcePaths(workspace);
  const files = workspace.nodes.flatMap((node) =>
    node.kind === "file" && !node.binary
      ? [{ path: paths.get(node.id)!, content: node.content }]
      : [],
  );
  const available = files.filter((file) =>
    (EDITABLE_SOURCE.test(file.path) || (isReactWorkspace(workspace, paths) && reactArchitectureFile(file.path))) &&
    !file.path.split("/").some((part) => part.startsWith(".") || /^(node_modules|dist|build|\.next|generated|secrets?|config)$/i.test(part)) &&
    !file.path.split("/").some(part => part === "__generated__"),
  );
  return available.sort((a, b) => {
    const score = (path: string) => path === activePath ? 0 : /(?:^|\/)(?:page|App|index|globals|style)/i.test(path) ? 1 : 2;
    return score(a.path) - score(b.path) || a.path.localeCompare(b.path);
  });
}

export class ZoeEditInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message); this.name = "ZoeEditInputError";
  }
}

/** Whitelisted top-level pages only. No arbitrary file or folder creation by AI. */

export function requestedStaticPage(prompt: string): string | null {
  if (!isZoeStandalonePageInstruction(prompt)) return null;
  if (/\bprivacy\b|\bprivate\s+policy\b/i.test(prompt)) return "privacy.html";
  if (/\bterms(?:\s+of\s+service|\s+and\s+conditions)?\b/i.test(prompt)) return "terms.html";
  if (/\babout(?:\s+us)?\b/i.test(prompt)) return "about.html";
  if (/\bcontact(?:\s+us)?\b/i.test(prompt)) return "contact.html";
  if (/\b(?:faq|frequently\s+asked\s+questions)\b/i.test(prompt)) return "faq.html";
  return null;
}

/** Independently verify that the requested page is an actual document, not a homepage section. */
export function assertStaticPageProposal(
  pagePath: string, edits: readonly ZoeSourceEdit[], existing: boolean, originalHome?: string,
): void {
  if (!isZoeStaticPagePath(pagePath)) throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Unsupported page route.");
  const page = edits.find(edit => edit.path === pagePath);
  const home = edits.find(edit => edit.path === "index.html");
  const linkedHome = home?.content ?? originalHome ?? "";
  if (!page || !linkedHome || (existing ? page.create : page.create !== true) ||
      !/<html\b/i.test(page.content) || !/<head\b/i.test(page.content) ||
      !/<body\b/i.test(page.content) || !/href\s*=\s*["'](?:\.\/|\/)?index\.html["']/i.test(page.content) ||
      !new RegExp(`href\\s*=\\s*[\"'](?:\\./|/)?(?:${pagePath.replace(".", "\\.")}|${pagePath.slice(0, -5)})[\"']`, "i").test(linkedHome)) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_NOT_CREATED", "The proposal must include a real HTML page and a working homepage link. No changes were saved.");
  }
}

/** Both AI proposals and human-approved apply payloads use this same strict validator. */
export function validateZoeEdits(
  workspace: WorkspaceStateV2,
  edits: unknown,
): readonly ZoeSourceEdit[] {
  const paths = sourcePaths(workspace);
  const reactWorkspace = isReactWorkspace(workspace, paths);
  // No AI-specific edit-count limit. The authoritative workspace policy
  // validates final node/file counts and aggregate bytes after in-memory apply.
  if (!Array.isArray(edits) || edits.length < 1) {
    throw new ZoeEditInputError("BUILD_EDIT_INVALID", "Expected at least one approved file change.");
  }
  const permitted = new Map(listZoeEditableFiles(workspace, null).map((file) => [file.path, file.content]));
  const originalPaths = new Set(paths.values());
  const seen = new Set<string>();
  const homeNode = workspace.nodes.find(node => node.kind === "file" && paths.get(node.id) === "index.html");
  const originalHome = homeNode?.kind === "file" && !homeNode.binary ? homeNode.content : null;
  const topLevelHtml = originalHome !== null;
  const requestedPages = edits.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const path = (item as { path?: unknown }).path;
    return typeof path === "string" && isZoeStaticPagePath(path) ? [path] : [];
  });
  if (requestedPages.length > 1) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Only one standalone page can be prepared per request.");
  }
  const linkedHome = requestedPages.length === 1 && originalHome !== null
    ? linkZoeStaticPageInHome(originalHome, requestedPages[0]!) : null;
  return edits.map((unknownEdit) => {
    if (!unknownEdit || typeof unknownEdit !== "object" || Array.isArray(unknownEdit)) {
      throw new ZoeEditInputError("BUILD_EDIT_INVALID", "Invalid file edit.");
    }
    const edit = unknownEdit as Record<string, unknown>;
    const { path, content, beforeSha256 } = edit;
    const create = edit.create === true;
    const allowedCreation = create && typeof path === "string" &&
      ((isZoeStaticPagePath(path) && topLevelHtml && !reactWorkspace) ||
        (reactWorkspace && (safeNewReactFile(path)))) &&
      !permitted.has(path) &&
      !originalPaths.has(path);
    // Deterministic homepage linking is still independently verified against source hashes.
    const deterministicHome = path === "index.html" && typeof content === "string" &&
      linkedHome !== null && originalHome !== null && content === linkedHome &&
      content !== originalHome && content.length <= ZOE_STATIC_HOME_LINK_MAX_CHARS;
    if (typeof path !== "string" || seen.has(path) ||
      (create ? !allowedCreation : !permitted.has(path) && !deterministicHome) ||
      (path === "index.html" && requestedPages.length === 1 && !deterministicHome) ||
      typeof content !== "string" || !content.length ||
      typeof beforeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(beforeSha256)) {
      throw new ZoeEditInputError("BUILD_EDIT_INVALID", "Edit target or content is invalid.");
    }
    if (create && isZoeReactPageSourcePath(path) &&
        (typeof content !== "string" || !/export\s+default\b/.test(content))) {
      throw new ZoeEditInputError("BUILD_REACT_ROUTE_INVALID", "React pages must have a default-exported component.");
    }
    if (reactWorkspace && typeof path === "string" && path.endsWith(".json") &&
        reactArchitectureFile(path)) {
      try { JSON.parse(content as string); }
      catch { throw new ZoeEditInputError("BUILD_EDIT_INVALID", "Invalid structured JSON data."); }
    }
    if (reactWorkspace && isZoeReactPageSourcePath(path)) {
      const issue = invalidZoeReactPageSource(path,content);
      if (issue) throw new ZoeEditInputError("BUILD_REACT_PAGE_IMPORT_CYCLE",issue);
    }
    seen.add(path);
    const old = create ? "" : deterministicHome ? originalHome! : permitted.get(path)!;
    if (sha256(old) !== beforeSha256) {
      throw new ZoeEditInputError("BUILD_EDIT_STALE", "Project source changed; request a fresh proposal.");
    }
    if (old === content) {
      throw new ZoeEditInputError("BUILD_EDIT_UNCHANGED", "The proposed file has no changes.");
    }
    return create ? { path, content, beforeSha256, create: true as const } : { path, content, beforeSha256 };
  });
}

export function applyZoeEditsToWorkspace(
  workspace: WorkspaceStateV2,
  edits: unknown,
): WorkspaceStateV2 {
  const validated = validateZoeEdits(workspace, edits);
  const paths = sourcePaths(workspace);
  const replacements = new Map(validated.map((edit) => [edit.path, edit.content]));
  const created = validated.filter(edit => edit.create);
  const originalHome = workspace.nodes.find(node => node.kind === "file" && paths.get(node.id) === "index.html");
  for (const added of created.filter(edit => isZoeStaticPagePath(edit.path))) {
    assertStaticPageProposal(added.path, validated, false,
      originalHome?.kind === "file" && !originalHome.binary ? originalHome.content : undefined);
  }
  const staticCreates = created.filter(edit => isZoeStaticPagePath(edit.path));
  const home = workspace.nodes.find(node => node.kind === "file" && paths.get(node.id) === "index.html");
  if (staticCreates.length && (!home || home.kind !== "file" || Boolean(home.binary))) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Static HTML page creation requires a top-level index.html.");
  }
  const srcFolder = workspace.nodes.find(node => node.kind === "folder" && paths.get(node.id) === "src");
  const reactCreates = created.filter(edit => safeNewReactFile(edit.path));
  if (reactCreates.length && (!srcFolder || srcFolder.kind !== "folder")) {
    throw new ZoeEditInputError("BUILD_REACT_ENTRY_UNSUPPORTED", "React source requires the existing src folder.");
  }
  const folderByPath = new Map(workspace.nodes.flatMap(node => node.kind === "folder"
    ? [[paths.get(node.id)!, node.id] as const] : []));
  const occupiedPaths = new Set(paths.values());
  const folderNodes: WorkspaceStateV2["nodes"][number][] = [];
  const now = Date.now();
  // Parent folders are derived ONLY from validated safe creation paths.
  // Never rename, delete or move an existing folder or file as a side effect.
  for (const edit of reactCreates) {
    const parts = edit.path.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth++) {
      const folderPath = parts.slice(0, depth).join("/");
      if (folderByPath.has(folderPath)) continue;
      if (occupiedPaths.has(folderPath) || depth === 1) {
        throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Component folder conflicts with existing source.");
      }
      const parent = folderByPath.get(parts.slice(0, depth - 1).join("/"));
      if (!parent) throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Missing parent folder.");
      const id = randomUUID();
      folderByPath.set(folderPath, id);
      folderNodes.push({id, kind:"folder", name:parts[depth-1]!, parentId:parent,
        createdAt:now, updatedAt:now});
    }
  }
  const newNodes = created.map(edit => {
    const reactSource = safeNewReactFile(edit.path);
    const parentPath = edit.path.split("/").slice(0,-1).join("/");
    const parentId = reactSource ? folderByPath.get(parentPath) ?? null : null;
    const templateNode = reactSource
      ? workspace.nodes.find(node => node.kind === "file" && paths.get(node.id) === "src/App.tsx")
      : home;
    if (!templateNode || templateNode.kind !== "file" || (reactSource && !parentId)) {
      throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Missing safe source template.");
    }
    const { binary: _binary, ...template } = templateNode;
    return {...template, id: randomUUID(), name:edit.path.split("/").at(-1)!, parentId,
      content:edit.content, createdAt:now, updatedAt:now};
  });
  const updated: WorkspaceStateV2 = {
    ...workspace,
    nodes: [...workspace.nodes.map((node) => {
      if (node.kind !== "file") return node;
      const path = paths.get(node.id);
      if (path === undefined) {
        throw new ZoeEditInputError("BUILD_WORKSPACE_INVALID", "Invalid source tree.");
      }
      const next = replacements.get(path);
      return next === undefined ? node : { ...node, content: next, updatedAt: Date.now() };
    }), ...folderNodes, ...newNodes],
  };
  return parseBuildWorkspaceMutation(updated);
}

export function previewZoeEdits(
  baseVersion: number,
  workspace: WorkspaceStateV2,
  summary: string,
  edits: readonly ZoeSourceEdit[],
): ZoeSourceEditProposal {
  const paths = sourcePaths(workspace);
  const byPath = new Map(workspace.nodes.flatMap(node =>
    node.kind === "file" && !node.binary
      ? [[paths.get(node.id)!, node.content] as const] : []));
  return {
    baseVersion,
    summary: summary.slice(0, 600),
    edits: edits.map((edit) => ({
      ...edit,
      beforePreview: edit.create ? "" : byPath.get(edit.path) ?? "",
      afterPreview: edit.content,
    })),
  };
}
