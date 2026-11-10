import { describe, expect, it } from "vitest";
import { requireCanonicalDatabaseUrl } from "./databaseUrl.js";

describe("canonical database environment contract", () => {
    it("uses DATABASE_URL as the sole database setting", () => {
        expect(requireCanonicalDatabaseUrl({
            DATABASE_URL: "postgresql://test-only@localhost/zoeskoul_test",
        })).toBe("postgresql://test-only@localhost/zoeskoul_test");
    });

    it("fails closed when the canonical database URL is missing or blank", () => {
        expect(() => requireCanonicalDatabaseUrl({})).toThrow("DATABASE_URL is required");
        expect(() => requireCanonicalDatabaseUrl({ DATABASE_URL: "  " }))
            .toThrow("DATABASE_URL is required");
    });

    it("rejects each obsolete alias even when a canonical value is also provided", () => {
        for (const name of ["ADMIN_DATABASE_URL", "WEB_DATABASE_URL"] as const) {
            expect(() => requireCanonicalDatabaseUrl({ [name]: "postgres://other" }))
                .toThrow(name);
            expect(() => requireCanonicalDatabaseUrl({
                DATABASE_URL: "postgres://canonical", [name]: "postgres://canonical",
            })).toThrow(name);
        }
    });

    it("never exposes database credentials in its error message", () => {
        const privateValue = "postgresql://name:very-private-secret@localhost/project";
        try {
            requireCanonicalDatabaseUrl({ DATABASE_URL: privateValue, WEB_DATABASE_URL: privateValue });
            throw new Error("Expected a configuration error");
        } catch (error) {
            expect(String(error)).not.toContain("very-private-secret");
        }
    });
});
