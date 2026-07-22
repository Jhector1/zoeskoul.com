/**
 * Catalog browsing stays public, but opening an interactive module is an
 * authenticated learning action. Keep this matcher segment-based so catalog,
 * subject, or module slugs containing words such as "learn" cannot trigger it.
 */
export function isCatalogLearningPath(pathname: string) {
    const segments = pathname.split("/").filter(Boolean);

    return (
        segments.length >= 7 &&
        segments[0] === "catalog" &&
        segments[2] === "subjects" &&
        segments[4] === "modules" &&
        (segments[6] === "learn" || segments[6] === "practice")
    );
}
