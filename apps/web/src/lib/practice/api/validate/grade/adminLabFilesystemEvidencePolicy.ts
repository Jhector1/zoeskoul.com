/**
 * Until the Runner implements a validated, actor-bound read-only filesystem
 * evidence endpoint, authored administrative permission/ownership tests must
 * NEVER be passed by submitting browser-controlled commands, transcripts,
 * workspace entries, or claimed owner/mode values.
 */
export function requiresAuthoritativeAdminLabEvidence(expected: unknown): boolean {
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
    return Object.prototype.hasOwnProperty.call(expected, "adminLabFilesystemExpectations");
}


/**
 * Published Course 2 final-step submissions must never fall back to the
 * Course 1 command-pattern grader when the private filesystem contract is
 * missing. Match the DB-resolved topic/module/subject, not browser claims.
 * This is an admission guard, not a new grader or a source of answer keys.
 */
export function requiresCourse2FinalCapstoneFilesystemEvidence(instance: unknown): boolean {
    if (!instance || typeof instance !== "object" || Array.isArray(instance)) return false;
    const candidate = instance as Record<string, unknown>;
    if (candidate.exerciseKey !== "final-capstone-secure-project-step-5") return false;
    const topic = candidate.topic;
    if (!topic || typeof topic !== "object" || Array.isArray(topic)) return false;
    const resolved = topic as Record<string, unknown>;
    const subject = resolved.subject as Record<string, unknown> | null | undefined;
    const module = resolved.module as Record<string, unknown> | null | undefined;
    const topicSlug = resolved.slug;
    if (!subject || !module || subject.slug !== "linux-files-permissions-users" ||
        module.slug !== "linux-module-4-secure-project-capstone" ||
        typeof topicSlug !== "string") return false;
    return topicSlug === "final-capstone-secure-project" ||
        topicSlug.endsWith(".final-capstone-secure-project");
}
