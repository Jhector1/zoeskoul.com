import { AdminLabFilesystemExpectedSchema } from "@zoeskoul/code-contracts";

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

/**
 * Guard the exact published Course 2 capstone step at the existing GET
 * generation boundary, BEFORE a practice instance is persisted.
 *
 * The manifest identity is resolved from the trusted compiled bundle, never
 * from a browser-provided course or topic claim. Ordinary Linux Fundamentals
 * exercises remain on their established generation path.
 *
 * This is only an admission check; the existing validate handler and Runner
 * remain the sole grading authority. It cannot supply a private answer key.
 */
export function lacksPublishedCourse2FinalFilesystemContract(args: {
    exerciseKey: unknown;
    topicBundle: unknown;
    expected: unknown;
}): boolean {
    if (!args.topicBundle || typeof args.topicBundle !== "object" ||
        Array.isArray(args.topicBundle)) return false;
    const topic = args.topicBundle as Record<string, unknown>;
    if (args.exerciseKey !== "final-capstone-secure-project-step-5" ||
        topic.subjectSlug !== "linux-files-permissions-users" ||
        topic.moduleSlug !== "linux-module-4-secure-project-capstone" ||
        topic.topicId !== "final-capstone-secure-project") return false;

    // Never treat an absent, null, or malformed answer key as an ordinary
    // shell task. The later validator also rejects command-pattern fallbacks.
    const expected = args.expected;
    if (!requiresAuthoritativeAdminLabEvidence(expected)) return true;
    const record = expected as Record<string, unknown>;
    const raw = record.adminLabFilesystemExpectations;
    const incompatible = [
        "workspaceExpectations", "terminalExpectations", "hiddenShellCheck",
        "sourceChecks", "semanticChecks",
    ].some((field) => record[field] !== undefined && record[field] !== null) ||
        (Array.isArray(record.tests) && record.tests.some((test: unknown) =>
            test && typeof test === "object" &&
            (typeof (test as { stdout?: unknown }).stdout === "string" &&
                Boolean((test as { stdout: string }).stdout.trim()) ||
             typeof (test as { stdin?: unknown }).stdin === "string" &&
                Boolean((test as { stdin: string }).stdin.trim()))));
    return !AdminLabFilesystemExpectedSchema.safeParse(raw).success || incompatible;
}
