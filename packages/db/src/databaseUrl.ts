/**
 * Shared application database contract.
 *
 * Every service uses DATABASE_URL for its own authorized database connection.
 * Different services may supply different credentials, but aliases never select
 * a different database at runtime. Migrations already use DATABASE_URL.
 */
export type DatabaseEnvironment = Readonly<{
    DATABASE_URL?: string;
    ADMIN_DATABASE_URL?: string;
    WEB_DATABASE_URL?: string;
}>;

export function requireCanonicalDatabaseUrl(
    environment: DatabaseEnvironment = process.env,
): string {
    // Fail closed rather than silently preferring an obsolete credential.
    // The error contains only variable NAMES; it never includes values.
    const legacyNames = ["ADMIN_DATABASE_URL", "WEB_DATABASE_URL"] as const;
    for (const name of legacyNames) {
        if (environment[name] !== undefined) {
            throw new Error(
                `Deprecated database setting ${name} is configured. ` +
                "Remove database aliases and use DATABASE_URL for this process.",
            );
        }
    }

    const url = environment.DATABASE_URL?.trim();
    if (!url) {
        throw new Error("DATABASE_URL is required for this service.");
    }
    return url;
}
