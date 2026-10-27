import type { ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";

/** A per-tab recovery copy of an already reviewed but unapplied proposal.
 * This is NOT the separate, metadata-only billable-AI attempt journal.
 * Browser state is never trusted for authorization, versioning or verification.
 */
const PREFIX = "zoebuild:reviewed-source-proposal:v12k11n:";
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_CHARS = 3_000_000;
const HEX64 = /^[a-f0-9]{64}$/i;
const PROJECT_ID = /^[a-zA-Z0-9_-]{1,80}$/;
export type ProposalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Envelope = { version: 1; projectId: string; savedAt: number; proposal: ZoeSourceEditProposal };

function storageKey(projectId: string): string | null {
  return PROJECT_ID.test(projectId) ? `${PREFIX}${projectId}` : null;
}
function validProposal(value: unknown): value is ZoeSourceEditProposal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (!Number.isSafeInteger(p.baseVersion) || Number(p.baseVersion) < 1 ||
      typeof p.summary !== "string" || p.summary.length > 2_000 ||
      !Array.isArray(p.edits) || !p.edits.length || p.edits.length > 300) return false;
  const seen = new Set<string>();
  for (const item of p.edits) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const e = item as Record<string, unknown>;
    if (typeof e.path !== "string" || e.path.length === 0 || e.path.length > 512 ||
        !HEX64.test(String(e.beforeSha256)) || typeof e.content !== "string" ||
        typeof e.beforePreview !== "string" || typeof e.afterPreview !== "string" ||
        (e.create !== undefined && e.create !== true) || seen.has(e.path)) return false;
    seen.add(e.path);
  }
  return true;
}

/** Store only after a successful server proposal; never store prompts, IDs or API keys. */
export function keepReviewedProposal(
  storage: ProposalStorage, projectId: string, proposal: ZoeSourceEditProposal,
  now = Date.now(),
): boolean {
  const key = storageKey(projectId);
  if (!key || !validProposal(proposal)) return false;
  // Remove transient prior build evidence: a restored proposal is NOT a verified build.
  const stored: ZoeSourceEditProposal = {baseVersion:proposal.baseVersion,
    summary:proposal.summary, edits:proposal.edits};
  const json = JSON.stringify({version:1,projectId,savedAt:now,proposal:stored} satisfies Envelope);
  if (json.length > MAX_JSON_CHARS) return false;
  try { storage.setItem(key,json); return true; }
  catch { return false; }
}

/** Return only drafts matching this server-rendered project's CURRENT source version. */
export function recoverReviewedProposal(
  storage: ProposalStorage, projectId: string, currentSourceVersion: number,
  now = Date.now(),
): ZoeSourceEditProposal | null {
  const key = storageKey(projectId);
  if (!key) return null;
  let json: string | null;
  try { json = storage.getItem(key); } catch { return null; }
  if (!json) return null;
  let parsed: unknown;
  try { if (json.length > MAX_JSON_CHARS) throw Error("too large"); parsed = JSON.parse(json); }
  catch { clearReviewedProposal(storage, projectId); return null; }
  const e = parsed as Partial<Envelope> | null;
  if (!e || e.version !== 1 || e.projectId !== projectId ||
      typeof e.savedAt !== "number" || !Number.isFinite(e.savedAt) ||
      e.savedAt > now || now - e.savedAt > TTL_MS ||
      !validProposal(e.proposal) || e.proposal.baseVersion !== currentSourceVersion) {
    clearReviewedProposal(storage, projectId); return null;
  }
  // Do not trust any verification claims that could be injected into storage.
  return {baseVersion:e.proposal.baseVersion, summary:e.proposal.summary, edits:e.proposal.edits};
}

export function clearReviewedProposal(storage: ProposalStorage, projectId: string): void {
  const key = storageKey(projectId);
  if (!key) return;
  try { storage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
}
