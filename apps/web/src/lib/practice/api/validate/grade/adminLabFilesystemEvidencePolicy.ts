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
