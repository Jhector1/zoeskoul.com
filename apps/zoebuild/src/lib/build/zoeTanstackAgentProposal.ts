import { parseAiJsonText } from "@zoeskoul/ai-json";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { makeZoeEditClarification } from "./zoeEditClarification";
import { runZoeProjectAgent } from "./zoeProjectAgentLoop";
import { ZoeEditInputError, type ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";
import { prepareTanstackReviewedEdit, resolveTanstackRequestedPage } from "./zoeTanstackEditProposal";
import { isTanstackSourceWorkspace } from "./zoeTanstackSourcePolicy";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";

export type TanstackAgentProposalOutcome =
  | Readonly<{kind: "proposal"; proposal: ZoeSourceEditProposal; reasoningSummary?: string}>
  | Readonly<{kind: "clarification"; clarification: string}>;

/**
 * One canonical Zoe project-inspection agent, one TanStack-only proposal policy.
 * The caller owns authorization, billing and the verified reviewed-PATCH commit.
 * This operation never builds, writes or trusts model-supplied source hashes.
 */
export async function generateTanstackAgentProposal(input: Readonly<{
  workspace: WorkspaceStateV2;
  project: Readonly<{
    title: string; stackId: string | null; sourceVersion: number; activePath: string | null;
  }>;
  userRequest: string;
  conversation: readonly unknown[];
  requestedPage: string | null;
  system: string;
  generate: Parameters<typeof runZoeProjectAgent>[0]["generate"];
}>): Promise<TanstackAgentProposalOutcome> {
  if (input.project.stackId !== "tanstack-start-v1") {
    throw new ZoeEditInputError("BUILD_EDIT_STACK_UNSUPPORTED", "Only registered TanStack Start projects can be edited.");
  }
  const paths = new Set(input.workspace.nodes.filter(n => n.kind === "file")
    .map(n => pathOf(input.workspace.nodes, n.id)));
  if (!isTanstackSourceWorkspace(paths)) {
    throw new ZoeEditInputError("BUILD_EDIT_STACK_UNSUPPORTED", "The TanStack source entry files are missing.");
  }
  // Reject model-selected malformed, private, or dynamic routes before any paid call.
  if (input.requestedPage !== null) resolveTanstackRequestedPage(input.workspace, input.requestedPage);
  const output = await runZoeProjectAgent({
    workspace: input.workspace, project: input.project,
    userRequest: input.userRequest, conversation: input.conversation,
    system: input.system, generate: input.generate,
  });
  const parsed = parseAiJsonText<unknown>(output.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ZoeEditInputError("BUILD_EDIT_AI_INVALID", "Zoé did not return a valid source-edit proposal.");
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.edits)) {
    throw new ZoeEditInputError("BUILD_EDIT_AI_INVALID", "Zoé did not provide a valid edit list.");
  }
  if (record.edits.length === 0) {
    return {kind:"clarification", clarification:makeZoeEditClarification(record.summary)};
  }
  // Never accept model-claimed beforeSha256, permissions or build-verification fields.
  const proposal = prepareTanstackReviewedEdit({
    workspace: input.workspace, baseVersion: input.project.sourceVersion,
    requestedPage: input.requestedPage,
    summary: typeof record.summary === "string" ? record.summary : "Proposed TanStack source changes",
    drafts: record.edits as Array<{path:string;content:string;create:boolean}>,
    fullyInspectedPaths: output.fullyReadPaths,
  });
  return {kind:"proposal",proposal,reasoningSummary:output.metadata.reasoningSummary};
}
