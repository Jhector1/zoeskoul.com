export type CatalogCoursePublicationStatus =
    | "active"
    | "coming_soon"
    | "disabled"
    | "draft"
    | "legacy";

export type CatalogCourseVersionStatus =
    | "draft"
    | "active"
    | "legacy"
    | "disabled";

export type CatalogCourseStatusInput = {
    status?: CatalogCoursePublicationStatus | null;
    versioning?: {
        status?: CatalogCourseVersionStatus | null;
    } | null;
};

export type CatalogCourseStatusPresentation = {
    availabilityLabel: "Available" | "Coming soon" | "Unavailable";
    lifecycleLabel: "Draft version" | "Legacy version" | "Disabled version" | null;
};

/**
 * Keeps learner-facing availability separate from curriculum-version metadata.
 *
 * A course without versioning metadata is still an available course. The shared
 * subject visibility contract treats unversioned courses as normal active
 * courses, so the UI must not label that absence as a different course type.
 */
export function resolveCatalogCourseStatusPresentation(
    subject: CatalogCourseStatusInput,
): CatalogCourseStatusPresentation {
    const availabilityLabel =
        subject.status === "coming_soon"
            ? "Coming soon"
            : subject.status === "disabled" || subject.status === "draft"
              ? "Unavailable"
              : "Available";

    const lifecycleLabel = (() => {
        switch (subject.versioning?.status) {
            case "draft":
                return "Draft version" as const;
            case "legacy":
                return "Legacy version" as const;
            case "disabled":
                return "Disabled version" as const;
            case "active":
            default:
                return null;
        }
    })();

    return {
        availabilityLabel,
        lifecycleLabel,
    };
}

export const CATALOG_COURSE_FALLBACK_ART_VARIANT_COUNT = 6 as const;

export type CatalogCourseFallbackArtVariant = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Resolve a stable visual fallback for a catalog course that has no authored
 * image. The course identity (normally the canonical slug) is the only input,
 * so the same course keeps the same art across locales, sessions, and apps.
 *
 * This intentionally owns only variant selection. The actual visual palette
 * remains in the shared ui-styles layer.
 */
export function resolveCatalogCourseFallbackArtVariant(
  identity: string,
): CatalogCourseFallbackArtVariant {
  const normalized = identity.trim().toLowerCase();

  if (!normalized) {
    return 0;
  }

  // FNV-1a: small, deterministic, dependency-free, and stable across runtimes.
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return (
    hash % CATALOG_COURSE_FALLBACK_ART_VARIANT_COUNT
  ) as CatalogCourseFallbackArtVariant;
}
