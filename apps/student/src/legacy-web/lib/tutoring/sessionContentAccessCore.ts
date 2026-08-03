import type { TutoringSnapshot } from "./sessionSnapshot";

export type TutoringContentScopeDecision =
  | {
      ok: true;
      sourceModuleSlug: string;
      sessionModuleSlug: string;
    }
  | {
      ok: false;
      reason: "subject_mismatch" | "module_not_in_snapshot";
    };

/**
 * The tutoring snapshot, not the normal private-course assignment table, is
 * the source of truth for content scope. Accept both module identities because
 * authored quiz specs use the source slug while tutoring navigation uses the
 * session-specific slug.
 */
export function resolveTutoringSnapshotContentScope(args: {
  snapshot: TutoringSnapshot;
  subjectSlug: string;
  moduleSlug: string;
}): TutoringContentScopeDecision {
  if (args.snapshot.subjectSlug !== args.subjectSlug) {
    return { ok: false, reason: "subject_mismatch" };
  }

  const selected = args.snapshot.modules.find(
    (entry) =>
      entry.sourceModuleSlug === args.moduleSlug ||
      entry.sessionModuleSlug === args.moduleSlug,
  );
  if (!selected) {
    return { ok: false, reason: "module_not_in_snapshot" };
  }

  return {
    ok: true,
    sourceModuleSlug: selected.sourceModuleSlug,
    sessionModuleSlug: selected.sessionModuleSlug,
  };
}
