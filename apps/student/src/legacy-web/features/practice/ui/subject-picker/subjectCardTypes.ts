export type SubjectCard = {
    slug: string;
    subjectId?: string | null;
    title: string;
    description: string;
    defaultModuleSlug: string | null;
    imagePublicId: string | null;
    imageAlt: string | null;
    enrolled: boolean;
    status: "active" | "coming_soon" | "disabled" | "draft" | "legacy";
    availabilityStatus?: "seeded" | "unseeded";
    versioning?: {
        family?: string;
        status?: "draft" | "active" | "legacy" | "disabled";
        defaultForNewEnrollments?: boolean;
    } | null;
};
