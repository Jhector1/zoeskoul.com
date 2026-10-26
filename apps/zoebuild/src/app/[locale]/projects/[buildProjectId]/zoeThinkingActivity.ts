/**
 * Pure presentation state for the event-driven Zoé activity panel.
 * This is not reasoning, provider progress or an entitlement decision.
 * Keep it JSX-free so the ZoeBuild unit suite can exercise the state logic
 * without changing its existing Next.js TSX build pipeline.
 */
export type ZoeThinkingPhase = "checking" | "model_requested" | "build_verification" | "proposal_validated";

const phaseLabel: Readonly<Record<ZoeThinkingPhase, string>> = {
  checking: "Checking the current project",
  model_requested: "Preparing the requested changes",
  build_verification: "Compiling the candidate in the isolated runner",
  proposal_validated: "Changes are ready to review",
};

export function deriveZoeThinkingActivity(input: Readonly<{
  busy: boolean;
  phase: ZoeThinkingPhase;
  summary: string;
}>) {
  const cleaned = input.summary.trim();
  const ready = !input.busy && input.phase === "proposal_validated";
  const failed = !input.busy && !ready;
  const message = input.busy ? phaseLabel[input.phase]
    : ready ? "Changes are ready to review" : "The edit could not be prepared";
  return {
    visible: input.busy || cleaned.length > 0,
    ready,
    failed,
    message,
    eyebrow: input.busy ? "Zoé is working" : ready ? "Proposal ready" : "Request ended",
    state: input.busy ? "active" as const : ready ? "ready" as const : "failed" as const,
    cleaned,
    summaryPreview: cleaned.replace(/\s+/g, " "),
  };
}
