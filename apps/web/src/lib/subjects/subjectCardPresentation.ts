export type SubjectCardPresentation = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
    visibility?: "public" | "private" | "organization";
};

export type PersistedSubjectCardPresentation = {
    title: string | null;
    description: string | null;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
};

function firstText(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        const normalized = value?.trim();
        if (normalized) return normalized;
    }

    return null;
}

/**
 * Resolves the learner-facing course card presentation in one place.
 *
 * Authored manifest values are the source of truth. Prisma remains a
 * compatibility fallback for presentation fields that have not yet moved into
 * the manifest, such as existing Cloudinary cover images.
 */
export function mergeSubjectCardPresentation<
    T extends SubjectCardPresentation,
>(
    authored: T,
    persisted: PersistedSubjectCardPresentation | null | undefined,
): T {
    const title = firstText(authored.title, persisted?.title, authored.slug) ?? authored.slug;
    const description = firstText(authored.description, persisted?.description) ?? "";
    const imagePublicId = authored.imagePublicId ?? persisted?.imagePublicId ?? null;
    const imageAlt = firstText(authored.imageAlt, persisted?.imageAlt, title) ?? title;
    const defaultModuleSlug =
        authored.defaultModuleSlug ?? persisted?.defaultModuleSlug ?? null;

    return {
        ...authored,
        title,
        description,
        imagePublicId,
        imageAlt,
        defaultModuleSlug,
    };
}
