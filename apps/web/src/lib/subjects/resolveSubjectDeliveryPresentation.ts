import "server-only";

import { resolveServerText } from "@/lib/subjects/resolveServerText";

type SubjectDeliveryPresentation = {
  slug: string;
  title: string;
  description?: string | null;
};

async function resolveOne<T extends SubjectDeliveryPresentation>(subject: T, locale: string): Promise<T> {
  const title = await resolveServerText({
    locale,
    preferredKey: `subjects.${subject.slug}.title`,
    dbValue: subject.title,
    fallback: subject.slug,
    finalFallback: subject.slug,
  });

  const description = Object.prototype.hasOwnProperty.call(subject, "description")
    ? await resolveServerText({
        locale,
        preferredKey: `subjects.${subject.slug}.description`,
        dbValue: subject.description ?? null,
        fallback: null,
        finalFallback: "",
      })
    : undefined;

  return {
    ...subject,
    title,
    ...(description !== undefined ? { description } : {}),
  };
}

/**
 * Resolves DB-backed subject message references before delivery/admin UI renders
 * them. The cache keeps repeated assignments for the same course from resolving
 * the same title and description more than once in a request.
 */
export async function resolveSubjectDeliveryPresentations<T extends SubjectDeliveryPresentation>(
  subjects: readonly T[],
  locale = "en",
): Promise<T[]> {
  const bySlug = new Map<string, Promise<T>>();

  return Promise.all(
    subjects.map((subject) => {
      const existing = bySlug.get(subject.slug);
      if (existing) return existing;

      const resolved = resolveOne(subject, locale);
      bySlug.set(subject.slug, resolved);
      return resolved;
    }),
  );
}
