export function resolveLogicalSectionSlug(args: {
    subjectSlug: string;
    rawSectionSlug: string;
}): string {
    const subjectSlug = args.subjectSlug.trim();
    const rawSectionSlug = args.rawSectionSlug.trim();

    if (!subjectSlug || !rawSectionSlug) return rawSectionSlug;
    if (rawSectionSlug.startsWith(`${subjectSlug}-`)) return rawSectionSlug;

    return `${subjectSlug}-${rawSectionSlug}`;
}
