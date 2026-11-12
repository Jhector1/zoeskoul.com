/**
 * Defense in depth at the EXISTING PracticeQuestionInstance persistence boundary.
 * The student projection also redacts this key, but the raw GET API returns
 * publicPayload directly. Keep the trusted contract in secretPayload.expected.
 *
 * Do not remove normal Course 1 exercise fields or alter the original value.
 */
export function redactAdminFilesystemExpectations<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(redactAdminFilesystemExpectations) as T;
    }
    if (value === null || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
        if (key === "adminLabFilesystemExpectations") continue;
        clean[key] = redactAdminFilesystemExpectations(nested);
    }
    return clean as T;
}
