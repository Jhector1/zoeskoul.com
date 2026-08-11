/**
 * Returns true when Review navigation must ignore learner progression gates.
 *
 * `unlockAll` covers privileged review surfaces such as admin review and
 * Draft QA. `usesProgressGating=false` covers workspaces whose capability
 * contract is intentionally progression-free.
 *
 * This policy must be used both for outer card navigation and for nested
 * quiz/project navigation.
 */
export function resolveReviewFreeNavigation(args: {
  unlockAll?: boolean;
  usesProgressGating: boolean;
}): boolean {
  return Boolean(args.unlockAll) || !args.usesProgressGating;
}
