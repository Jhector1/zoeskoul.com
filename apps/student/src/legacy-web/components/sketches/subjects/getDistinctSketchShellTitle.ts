export function normalizeSketchHeading(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

export function getDistinctSketchShellTitle(
    cardTitle: string | null | undefined,
    contentTitle: string | null | undefined,
): string | undefined {
    const resolvedCardTitle = cardTitle?.trim();
    if (!resolvedCardTitle) return undefined;

    const resolvedContentTitle = contentTitle?.trim();
    if (
        resolvedContentTitle &&
        normalizeSketchHeading(resolvedCardTitle) ===
            normalizeSketchHeading(resolvedContentTitle)
    ) {
        return undefined;
    }

    return resolvedCardTitle;
}
