import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    fileURLToPath(new URL("./route.ts", import.meta.url)),
    "utf8",
);

describe("Google narration credential precedence", () => {
    it("uses GOOGLE_APPLICATION_CREDENTIALS as the authoritative local file", () => {
        const pathIndex = source.indexOf(
            "const credentialPath =",
        );
        const fileBranch = source.indexOf(
            "if (credentialPath)",
        );
        const inlineBranch = source.indexOf(
            "} else if (inline)",
        );

        expect(pathIndex).toBeGreaterThan(-1);
        expect(fileBranch).toBeGreaterThan(pathIndex);
        expect(inlineBranch).toBeGreaterThan(fileBranch);
    });

    it("keeps inline JSON only as a fallback", () => {
        expect(source).toContain(
            "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON",
        );
        expect(source).toContain(
            "raw = inline",
        );
    });
});
