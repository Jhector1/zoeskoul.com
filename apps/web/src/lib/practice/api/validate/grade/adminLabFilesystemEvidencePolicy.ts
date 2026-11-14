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
 * The final step is a COMPLETE seven-path assessment, not a generic single-file
 * permission exercise. Its published contract must cover the entire approved
 * project tree (including the one deliberately root-owned README).
 *
 * This is a server-side admission/validation invariant, NOT a source of the
 * published private contract. Only the approved, version-bound server-private
 * curriculum handoff can supply that contract; draft QA must never supply it.
 *
 * Compare parsed, canonical schema values, not browser claims or path prefixes.
 * Order is irrelevant; duplicates, omissions and permissive substitutions are
 * forbidden. Ordinary Course 1 tasks are NOT subject to this capstone policy.
 */
/** Fixed candidate contract, supplied ONLY by the separately approved server
 * publication handoff. Merely importing this function never authorizes grading.
 * Reused by both the fingerprint-gated private resolver and strict validator.
 */
export function course2FinalFilesystemExpected() {
    return {required: [
        {path: "/workspace/secure-project", kind: "directory" as const, mode: "0755", uid: 1000, gid: 1000},
        {path: "/workspace/secure-project/README.md", kind: "file" as const, mode: "0644", uid: 0, gid: 0},
        {path: "/workspace/secure-project/scripts", kind: "directory" as const, mode: "0700", uid: 1000, gid: 1000},
        {path: "/workspace/secure-project/scripts/run.sh", kind: "file" as const, mode: "0700", uid: 1000, gid: 1000},
        {path: "/workspace/secure-project/secrets.env", kind: "file" as const, mode: "0600", uid: 1000, gid: 1000},
        {path: "/workspace/secure-project/shared", kind: "directory" as const, mode: "0770", uid: 1000, gid: 1000},
        {path: "/workspace/secure-project/shared/notes.txt", kind: "file" as const, mode: "0640", uid: 1000, gid: 1000},
    ]};
}

export function matchesCompleteCourse2FinalFilesystemContract(raw: unknown): boolean {
    const parsed = AdminLabFilesystemExpectedSchema.safeParse(raw);
    if (!parsed.success) return false;
    const required = parsed.data.required;
    const approved = new Map(course2FinalFilesystemExpected().required.map((entry) =>
        [entry.path, [entry.kind, entry.mode, entry.uid, entry.gid] as const] as const,
    ));
    if (required.length !== approved.size) return false;
    const seen = new Set<string>();
    for (const entry of required) {
        const reference = approved.get(entry.path);
        if (!reference || seen.has(entry.path)) return false;
        seen.add(entry.path);
        if (entry.kind !== reference[0] || entry.mode !== reference[1] ||
            entry.uid !== reference[2] || entry.gid !== reference[3]) return false;
    }
    return seen.size === approved.size;
}

/** An administrator filesystem assessment has exactly one grading authority.
 * Browser transcripts, shell stdout, source solutions and workspace assertions
 * must never become alternate ways to earn a filesystem PASS.
 */
export function hasCompetingAdminLabGradingStrategy(raw: unknown): boolean {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
    const value = raw as Record<string, unknown>;
    const blocked = [
        "workspaceExpectations", "terminalExpectations", "hiddenShellCheck",
        "sourceChecks", "semanticChecks", "solutionFiles", "solutionCode",
    ].some((field) => value[field] !== undefined && value[field] !== null);
    const tests = value.tests;
    const hasTests = tests !== undefined && tests !== null &&
        (!Array.isArray(tests) || tests.some((test: unknown) =>
            test && typeof test === "object" && (
                typeof (test as {stdout?: unknown}).stdout === "string" &&
                    Boolean((test as {stdout:string}).stdout.trim()) ||
                typeof (test as {stdin?: unknown}).stdin === "string" &&
                    Boolean((test as {stdin:string}).stdin.trim())
            )));
    const nested = value.workspace;
    const nestedExpected = nested && typeof nested === "object" &&
        !Array.isArray(nested) &&
        (nested as {workspaceExpectations?:unknown}).workspaceExpectations != null;
    return blocked || hasTests || Boolean(nestedExpected);
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
    // The server-minted compiled-bundle fingerprint is required even when the
    // seven filesystem rows are complete. An unversioned key is not approved.
    if (typeof record.adminLabPublishedTopicSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(record.adminLabPublishedTopicSha256)) return true;
    return hasCompetingAdminLabGradingStrategy(expected) ||
        !matchesCompleteCourse2FinalFilesystemContract(raw);
}
