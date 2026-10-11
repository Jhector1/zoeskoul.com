export function authoredManifestTopicAliasSuffixes(
    candidateSlugs: readonly string[],
) {
    const suffixes = candidateSlugs
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .map((value) => {
            const parts = value
                .split(".")
                .map((part) => part.trim())
                .filter(Boolean);
            const leaf = parts.length ? parts[parts.length - 1] : value;
            return leaf ? `.${leaf}` : "";
        })
        .filter(Boolean);

    return Array.from(new Set(suffixes));
}
