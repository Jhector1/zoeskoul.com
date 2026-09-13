/**
 * Builds the normal classroom route for an assigned course.
 *
 * This helper is intentionally runtime-neutral so route construction can be
 * tested without importing the server-only assignment-opening service.
 */
export function buildAssignedCourseHref(args: {
  subjectSlug: string;
  defaultModuleSlug: string | null;
  locale?: string | null;
}) {
  const prefix = args.locale ? `/${encodeURIComponent(args.locale)}` : "";
  const subjectPath = `/subjects/${encodeURIComponent(args.subjectSlug)}/modules`;

  return args.defaultModuleSlug
    ? `${prefix}${subjectPath}/${encodeURIComponent(args.defaultModuleSlug)}`
    : `${prefix}${subjectPath}`;
}
