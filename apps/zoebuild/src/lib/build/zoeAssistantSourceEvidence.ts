import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { listZoeEditableFiles } from "./zoeTargetedSourceEdit";

/**
 * Server-only evidence for answering questions about the currently authorized project.
 * Never use this as a permission gate or a source of instructions to the model.
 * Bounded previews avoid copying entire projects into the economical intent request.
 */
const MAX_EVIDENCE_FILES = 4;
const MAX_EVIDENCE_FILE_CHARS = 2_400;
const MAX_EVIDENCE_TOTAL_CHARS = 7_200;

// Defense in depth: editable source can still contain accidentally committed keys.
const SENSITIVE_CONTENT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk-proj-|sk_live_|ghp_|xox[baprs]-)[A-Za-z0-9_-]{12,}/;

type EvidenceFile = Readonly<{path: string; excerpt: string; truncated: boolean}>;
export type ZoeAssistantSourceEvidence = Readonly<{
  files: readonly EvidenceFile[];
  availableFiles: number;
  omittedFiles: number;
  scope: "partial-source-excerpts";
  /** Path-only index: a route/file mention is NOT proof it can be edited. */
  routeRelevantPaths: readonly string[];
}>;

export function selectZoeAssistantSourceEvidence(
  workspace: WorkspaceStateV2,
  activePath: string | null,
): ZoeAssistantSourceEvidence {
  const permitted = listZoeEditableFiles(workspace, activePath);
  const files: EvidenceFile[] = [];
  let remaining = MAX_EVIDENCE_TOTAL_CHARS;
  for (const file of permitted) {
    if (files.length >= MAX_EVIDENCE_FILES || remaining <= 0) break;
    // No binary data, dotfiles, config folders or oversized files reach this list.
    // Also exclude source containing obvious embedded provider credentials.
    if (SENSITIVE_CONTENT.test(file.content)) continue;
    const length = Math.min(file.content.length, MAX_EVIDENCE_FILE_CHARS, remaining);
    if (length <= 0) continue;
    files.push({path: file.path, excerpt: file.content.slice(0, length), truncated: length < file.content.length});
    remaining -= length;
  }
  // React navigation and route structure are more informative than whichever
  // four source files happened to sort first. Include path names only and
  // keep them separate from the editable-content evidence and permissions.
  const routeRelevantPaths = workspace.nodes.filter(node=>node.kind==="file")
    .map(node=>pathOf(workspace.nodes,node.id))
    .filter(path=>!path.split("/").some(part=>part.startsWith(".")||
      ["node_modules","dist","build","secrets","config"].includes(part)))
    .filter(path=>path==="package.json"||/^(?:src\/)?(?:App|main|router|routes?)(?:\/|\.)/i.test(path)||
      /(?:^|\/)routes?\//i.test(path))
    .sort().slice(0,20);
  return {files, availableFiles: permitted.length,
    omittedFiles: permitted.length - files.length,
    routeRelevantPaths,scope: "partial-source-excerpts"};
}
