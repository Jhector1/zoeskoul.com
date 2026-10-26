import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import type { ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";
import { ZOE_EDIT_MAX_FILES } from "./zoeSourceEditLimits";

/** A server-confirmed version is necessary but not sufficient: verify exact file bodies.
 * This is source integrity evidence, never a claim that the rendered UI matches intent.
 */
export function verifyAppliedZoeSource(
  workspace: WorkspaceStateV2,
  approved: ZoeSourceEditProposal["edits"],
): readonly string[] {
  if (!Array.isArray(approved) || !approved.length || approved.length > ZOE_EDIT_MAX_FILES) {
    throw new Error("APPLIED_EDIT_EVIDENCE_INVALID");
  }
  const files = new Map<string, string>();
  for (const node of workspace.nodes) {
    if (node.kind !== "file" || node.binary) continue;
    const path = pathOf(workspace.nodes, node.id);
    if (files.has(path)) throw new Error("APPLIED_EDIT_SNAPSHOT_AMBIGUOUS");
    files.set(path, node.content);
  }
  const paths = new Set<string>();
  for (const edit of approved) {
    if (!edit || typeof edit.path !== "string" || typeof edit.content !== "string" || paths.has(edit.path)) {
      throw new Error("APPLIED_EDIT_EVIDENCE_INVALID");
    }
    paths.add(edit.path);
    if (files.get(edit.path) !== edit.content) {
      throw new Error("APPLIED_EDIT_SNAPSHOT_MISMATCH");
    }
  }
  return [...paths];
}
