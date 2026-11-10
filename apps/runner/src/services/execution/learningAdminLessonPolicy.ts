/** Course 2 lesson eligibility is a restriction, NOT user authorization.
 * A future trusted web endpoint must additionally verify the authenticated
 * learner, enrollment, published topic and assessment before minting a grant.
 * Never accept a browser's claimed topic as sufficient authorization.
 */
export const ADMIN_COURSE_SLUG = "linux-files-permissions-users" as const;
export const ADMIN_LAB_TOPIC_SLUGS = Object.freeze([
  "sudo-root-concepts",
  "ownership-administration-concepts",
  "final-capstone-secure-project",
] as const);
const adminTopics = new Set<string>(ADMIN_LAB_TOPIC_SLUGS);

export function isEligibleAdminLabLesson(course: unknown, topic: unknown): boolean {
  return course === ADMIN_COURSE_SLUG && typeof topic === "string" && adminTopics.has(topic);
}
