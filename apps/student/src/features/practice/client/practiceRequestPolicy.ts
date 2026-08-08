import type { PurposeMode, PurposePolicy } from "@/lib/subjects/types";

export type PracticePurposeRequestParams = {
  preferPurpose?: PurposeMode;
  purposePolicy?: PurposePolicy;
};

/**
 * Session-backed practice is governed by the persisted run policy.
 *
 * Omitting client purpose overrides for an existing session prevents a stale
 * first render from racing the authoritative status response. This matters for
 * locked experiences such as onboarding trials, assignments, daily practice,
 * and public challenges: the server already knows the allowed purpose and the
 * client must not temporarily reinterpret the run while metadata is loading.
 */
export function resolvePracticePurposeRequestParams(args: {
  sessionId?: string | null;
  preferPurpose?: PurposeMode;
  purposePolicy?: PurposePolicy;
}): PracticePurposeRequestParams {
  if (String(args.sessionId ?? "").trim()) return {};

  return {
    ...(args.preferPurpose ? { preferPurpose: args.preferPurpose } : {}),
    ...(args.purposePolicy ? { purposePolicy: args.purposePolicy } : {}),
  };
}
