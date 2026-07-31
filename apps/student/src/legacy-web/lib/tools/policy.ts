const PROGRAMMING_PROFILES = new Set([
    "python",
    "java",
    "javascript",
    "typescript",
    "c",
    "cpp",
    "sql",
    "bash",
    "git",
]);

export function toolsPolicyForSubject(
    _subjectSlug: string,
    meta?: any,
    profileId?: string | null,
) {
    // Long-term: prefer meta.tools.codeEnabled if you add it to PracticeSubject.meta
    const metaEnabled = meta?.tools?.codeEnabled;
    if (typeof metaEnabled === "boolean") {
        return { codeEnabled: metaEnabled };
    }

    const profile = String(profileId ?? "").trim().toLowerCase();

    return {
        codeEnabled: PROGRAMMING_PROFILES.has(profile),
    };
}
