/**
 * An active Tools lease or terminal evidence from a previous Try must never
 * override the identity of the Try being checked. Missing exact evidence is a
 * non-passing state; it is not permission to borrow another exercise's shell.
 */
export type PracticeCandidateRank = {
  score: number;
  hasIdentityMatch: boolean;
  hasTerminalEvidence: boolean;
  updatedAt: number;
};

export function rankPracticeRuntimeCandidates<T extends PracticeCandidateRank>(
  candidates: T[],
  needsTerminalEvidence: boolean,
): T[] {
  const eligible = needsTerminalEvidence
    ? candidates.filter((candidate) => candidate.hasIdentityMatch)
    : candidates;

  return [...eligible].sort((a, b) => {
    if (a.hasIdentityMatch !== b.hasIdentityMatch) {
      return a.hasIdentityMatch ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (needsTerminalEvidence && a.hasTerminalEvidence !== b.hasTerminalEvidence) {
      return a.hasTerminalEvidence ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });
}
