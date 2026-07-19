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
