/**
 * Stage 4A: exact, published Course 2 administrative lab targets.
 * This is an upper bound on what can be requested, NOT proof of access.
 * The web server must still check the live actor, enrollment, published
 * module/topic metadata and the existing practice entitlement.
 */
export const STUDENT_ADMIN_COURSE_SLUG = "linux-files-permissions-users" as const;

const adminTopicModule = Object.freeze({
  "sudo-root-concepts": "linux-module-3-users-groups-troubleshooting",
  "ownership-administration-concepts": "linux-module-3-users-groups-troubleshooting",
  "final-capstone-secure-project": "linux-module-4-secure-project-capstone",
} as const);

export type StudentAdminLabTarget = Readonly<{
  moduleSlug: (typeof adminTopicModule)[keyof typeof adminTopicModule];
  topicSlug: keyof typeof adminTopicModule;
}>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function parseStudentAdminLabTarget(value: unknown): StudentAdminLabTarget | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "moduleSlug" || keys[1] !== "topicSlug") {
    return null;
  }
  const { moduleSlug, topicSlug } = value;
  if (typeof moduleSlug !== "string" || typeof topicSlug !== "string" ||
      !Object.prototype.hasOwnProperty.call(adminTopicModule, topicSlug)) {
    return null;
  }
  if (moduleSlug !== adminTopicModule[topicSlug as keyof typeof adminTopicModule]) return null;
  return Object.freeze({ moduleSlug, topicSlug }) as StudentAdminLabTarget;
}

/** Verify the *published* compiled topic belongs to the exact requested module. */
export function matchesPublishedAdminTopic(
  target: StudentAdminLabTarget,
  compiled: unknown,
): boolean {
  if (!isPlainRecord(compiled)) return false;
  return compiled.subjectSlug === STUDENT_ADMIN_COURSE_SLUG &&
    compiled.moduleSlug === target.moduleSlug &&
    compiled.topicId === target.topicSlug;
}
