import {
  normalizeWorkspaceViewReferences,
  type WorkspaceStateV2,
} from "@zoeskoul/workspace-contracts";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function looksLikeWorkspace(value: unknown): value is WorkspaceStateV2 {
  if (!isPlainRecord(value)) return false;
  return value.version === 2 && Array.isArray(value.nodes);
}

/**
 * Persistence-boundary repair for review progress.
 *
 * This intentionally changes only workspace view references. Learner source,
 * files, node ids, stdin, results, grading state, and progress completion are
 * left untouched.
 */
export function sanitizeReviewProgressWorkspaceReferences<T>(value: T): T {
  if (looksLikeWorkspace(value)) {
    return normalizeWorkspaceViewReferences(value) as T;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const sanitized = sanitizeReviewProgressWorkspaceReferences(entry);
      if (sanitized !== entry) changed = true;
      return sanitized;
    });
    return (changed ? next : value) as T;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizeReviewProgressWorkspaceReferences(entry);
    next[key] = sanitized;
    if (sanitized !== entry) changed = true;
  }

  return (changed ? next : value) as T;
}
