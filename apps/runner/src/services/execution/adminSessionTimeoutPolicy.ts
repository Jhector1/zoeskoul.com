import type { TimeoutPolicy } from "../sessions/timeoutPolicy.js";
import { renewalEligible } from "./adminEgressRenewal.js";
import { FULL_PRIVILEGES_TOPIC_SLUG } from "./learningAdminLessonPolicy.js";

/** Fixed server-owned limits. This is NOT an egress lease extension.
 * Only the existing supervised protected development profile gets tutoring-length
 * global Full Privileges sessions. Graded lessons and other environments retain
 * the previously approved limits. No browser-supplied timing is honored. */
export function resolveAdminSessionTimeoutPolicy(
  topic: string | undefined,
  configuration: NodeJS.ProcessEnv = process.env,
): TimeoutPolicy {
  const extended = topic === FULL_PRIVILEGES_TOPIC_SLUG && renewalEligible(configuration);
  return {
    idleTimeoutMs: (extended ? 30 : 5) * 60_000,
    hardLifetimeMs: (extended ? 120 : 10) * 60_000,
    wallTimeoutMs: null,
  };
}
