import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { applyZoeEditsToWorkspace, listZoeEditableFiles, previewZoeEdits, sha256,
  validateZoeEdits, ZoeEditInputError, type ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";
import { isTanstackSourceWorkspace, isTanstackCreatableSource, tanstackPageUrl } from "./zoeTanstackSourcePolicy";

/** Only literal public routes are selected by the model; the server resolves real files. */
const PUBLIC_PAGE = /^\/(?:[a-z][a-z0-9-]{0,47})(?:\/[a-z][a-z0-9-]{0,47})*$/;

export function resolveTanstackRequestedPage(workspace: WorkspaceStateV2, url: string): Readonly<{
  path: string; url: string; exists: boolean;
}> {
  if (url !== "/" && !PUBLIC_PAGE.test(url)) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "Only literal public TanStack page routes may be edited.");
  }
  const editable = listZoeEditableFiles(workspace, null);
  const matches = editable.filter(f => tanstackPageUrl(f.path) === url);
  if (matches.length > 1) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_AMBIGUOUS", "Multiple page files claim the same public route.");
  }
  if (matches.length === 1) return {path: matches[0]!.path, url, exists: true};
  const candidate = url === "/" ? "src/routes/index.tsx" : `src/routes/${url.slice(1)}.tsx`;
  if (tanstackPageUrl(candidate) !== url) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "This public route cannot be created safely.");
  }
  // Do not permit creation over a private, server-only, or otherwise non-editable file.
  const occupied = workspace.nodes.some(node => node.kind === "file" &&
    pathOf(workspace.nodes, node.id) === candidate);
  if (occupied) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_UNSUPPORTED", "The target path is already in use.");
  }
  return {path: candidate, url, exists: false};
}

export type TanstackDraftEdit = Readonly<{path: string; content: string; create: boolean}>;

/**
 * Authoritative assembly of an agent proposal. The model never supplies hashes,
 * target permissions, project files, source version, or build evidence.
 * This does not save source and must not be used as a substitute for Runner build verification.
 */
export function prepareTanstackReviewedEdit(input: Readonly<{
  workspace: WorkspaceStateV2;
  baseVersion: number;
  summary: string;
  drafts: readonly TanstackDraftEdit[];
  fullyInspectedPaths: readonly string[];
  requestedPage?: string | null;
}>): ZoeSourceEditProposal {
  const { workspace, drafts, baseVersion } = input;
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 1 || !Array.isArray(drafts) || drafts.length === 0) {
    throw new ZoeEditInputError("BUILD_EDIT_INVALID", "A current source version and at least one change are required.");
  }
  const paths = new Set(workspace.nodes.filter(n => n.kind === "file")
    .map(n => pathOf(workspace.nodes, n.id)));
  if (!isTanstackSourceWorkspace(paths)) {
    throw new ZoeEditInputError("BUILD_EDIT_STACK_UNSUPPORTED", "Only TanStack Start source is supported.");
  }
  const existing = new Map(listZoeEditableFiles(workspace, null).map(f => [f.path, f.content] as const));
  const inspected = new Set(input.fullyInspectedPaths);
  if (![...inspected].some(p => existing.has(p))) {
    throw new ZoeEditInputError("BUILD_EDIT_INSPECTION_REQUIRED", "Inspect authorized source before proposing changes.");
  }
  const target = input.requestedPage == null ? null : resolveTanstackRequestedPage(workspace, input.requestedPage);
  const edits = drafts.map(draft => {
    if (!draft || typeof draft.path !== "string" || typeof draft.content !== "string" ||
        typeof draft.create !== "boolean") {
      throw new ZoeEditInputError("BUILD_EDIT_INVALID", "Invalid proposed file change.");
    }
    if (draft.create) {
      if (!isTanstackCreatableSource(draft.path, draft.content)) {
        throw new ZoeEditInputError("BUILD_TANSTACK_SOURCE_UNSAFE", "New files must be safe presentation source.");
      }
    } else if (!existing.has(draft.path) || !inspected.has(draft.path)) {
      throw new ZoeEditInputError("BUILD_EDIT_INSPECTION_REQUIRED", "Every changed existing file must be fully inspected.");
    }
    return {path: draft.path, content: draft.content, beforeSha256: sha256(
      draft.create ? "" : existing.get(draft.path) ?? ""), ...(draft.create ? {create: true as const} : {})};
  });
  const checked = validateZoeEdits(workspace, edits);
  if (target && !checked.some(e => e.path === target.path && Boolean(e.create) === !target.exists)) {
    throw new ZoeEditInputError("BUILD_EDIT_PAGE_NOT_CREATED", "The requested page must be included in the reviewed changes.");
  }
  // Full workspace policy is checked in memory. No persistence, build, or preview is performed.
  applyZoeEditsToWorkspace(workspace, checked);
  const summary = input.summary.trim() || "Proposed TanStack source changes";
  return previewZoeEdits(baseVersion, workspace,
    `${summary} Worker build verification is required before saving; browser rendering is not verified.`, checked);
}

/** Reject retired stacks. TanStack proposal POST and verified reviewed PATCH
 * now each own their execution-specific gate; an inactive verifier is never a
 * reason to charge AI credits or save a source change. */
export function zoeTanstackEditRuntimeGate(stackId: string | null): Readonly<{
  code: string; message: string; status: number;
}> | null {
  if (stackId === "tanstack-start-v1") return null;
  return {code:"BUILD_EDIT_STACK_UNSUPPORTED",status:422,
    message:"This project is not registered as TanStack Start. No AI request was executed or source changed."};
}
