export type PracticePurposeMode =
  | "quiz"
  | "project"
  | "practice"
  | "mixed";

export type PracticePurposePolicy = "strict" | "fallback";

export type PracticePurposeDefaults = {
  preferPurpose: PracticePurposeMode;
  purposePolicy: PracticePurposePolicy;
};

/**
 * Browser-safe request defaults only.
 *
 * Candidate eligibility and authored-queue filtering remain server-owned.
 * Daily Practice and self-paced Practice both use the same authored
 * purpose="practice" pool; Daily differs only by cadence/access/ranking.
 */
export function resolvePracticePurposeDefaults(args: {
  experienceMode: string;
  requestedPurpose?: PracticePurposeMode | null;
  requestedPolicy?: PracticePurposePolicy | null;
  isLockedRun: boolean;
}): PracticePurposeDefaults {
  if (
    args.experienceMode === "daily_five" ||
    args.experienceMode === "standard" ||
    args.experienceMode === "practice"
  ) {
    return {
      preferPurpose: "practice",
      purposePolicy: "strict",
    };
  }

  if (args.isLockedRun) {
    return {
      preferPurpose: "quiz",
      purposePolicy: "fallback",
    };
  }

  return {
    preferPurpose: args.requestedPurpose ?? "quiz",
    purposePolicy: args.requestedPolicy ?? "fallback",
  };
}
