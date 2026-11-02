/**
 * V2 conversation tone and receipts. Source of truth for what happened is the
 * calling server/UI branch, never a model assertion. No actions or permission
 * grants live in this module.
 */
export const ZOE_NATURAL_CONVERSATION_POLICY = [
  "Speak like a helpful developer, not an audit log. Answer the question directly, then explain only material limitations or the next useful step.",
  "Use clear everyday language. Do not narrate evidence snapshots, source excerpts, schemas, internal gates, or authorization mechanics unless the user explicitly needs those details.",
  "Do not repeat the same warning in consecutive turns. Apply it silently when context already establishes a constraint; correct a past misstatement clearly when necessary.",
  "Prefer a short response for a simple question; give full implementation detail, code, or architecture when the user requests it. No arbitrary maximum length.",
  "If the user asks whether a supported task can be done, say yes when the project evidence supports it, then distinguish the next required action from something already completed.",
  "If the user asks you to do a supported task, follow the existing action route and approval flow rather than describing a hypothetical workflow as if it had run.",
  "When a missing choice genuinely blocks an operation, ask one focused question. Otherwise, use reasonable project-aware defaults and continue.",
  "Do not end every answer with 'If you want' or a repetitive offer. Suggest an actionable next step only if it advances the user's request.",
  "Never infer that a preview ran, a build passed, a file was saved, a payment connected or a website went live from capability evidence alone.",
].join("\n");

export type ZoeActionReceipt =
  | Readonly<{kind:"settings-opened";providerName:string;setupAvailable:boolean}>
  | Readonly<{kind:"source-proposed";summary:string;fileCount:number}>
  | Readonly<{kind:"source-saved";sourceVersion:number}>
  | Readonly<{kind:"source-verified";sourceVersion:number;verifiedPaths:readonly string[]}>
  | Readonly<{kind:"source-sync-unverified"}>
  | Readonly<{kind:"plan-applied";sourceVersion:number}>;

/** Only construct a receipt in a branch that has actually observed the action. */
export function describeZoeActionReceipt(receipt: ZoeActionReceipt):string {
  switch (receipt.kind) {
    case "settings-opened":
      return receipt.setupAvailable
        ? `I've opened ${receipt.providerName} settings. You can review the connection and authorize setup there. I haven't connected an account or activated payments.`
        : `${receipt.providerName} doesn't have a working setup flow here yet. I've opened Site Settings to show what's available; nothing was connected.`;
    case "source-proposed":
      return `I've prepared changes for ${receipt.fileCount} ${receipt.fileCount===1?"file":"files"}: ${receipt.summary}. Review the proposal before applying it; your saved source hasn't changed.`;
    case "source-saved":
      return `Saved your approved changes as source version ${receipt.sourceVersion}. I'm checking the saved files now.`;
    case "source-verified":
      return `Verified ${receipt.verifiedPaths.length} saved ${receipt.verifiedPaths.length===1?"file":"files"} in version ${receipt.sourceVersion}. Preview has the updated source; the visual result still needs checking.`;
    case "source-sync-unverified":
      return "The files were saved, but I couldn't verify the refreshed workspace. Don't apply the same changes again—reload and inspect the saved version first.";
    case "plan-applied":
      return `The approved plan was saved as source version ${receipt.sourceVersion}. I'm loading the updated files now; this doesn't mean the site was published.`;
  }
}
