/**
 * Practice module slugs are authored inside a course/subject namespace. Keep
 * access lookups scoped by both values so two courses may safely use the same
 * module slug without leaking access between them.
 */
export function practiceModuleAccessKey(
  subjectSlug: string,
  moduleSlug: string,
): string {
  return `${subjectSlug}::${moduleSlug}`;
}
