import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    fileURLToPath(new URL("./route.ts", import.meta.url)),
    "utf8",
);

describe("Google narration OAuth assertion", () => {
    it("matches the independently verified RS256 service-account flow", () => {
        expect(source).toContain(
            'createSign("RSA-SHA256")',
        );
        expect(source).toContain(
            'kid: privateKeyId',
        );
        expect(source).toContain(
            'iss: clientEmail',
        );
        expect(source).toContain(
            '"https://www.googleapis.com/auth/cloud-platform"',
        );
        expect(source).toContain(
            '"https://oauth2.googleapis.com/token"',
        );
        expect(source).toContain(
            'signature.toString("base64url")',
        );
    });

    it("uses the parsed PEM exactly instead of trimming or rewriting it", () => {
        expect(source).toContain(
            'signer.sign(privateKey)',
        );
        expect(source).not.toContain(
            'privateKey.replace(',
        );
        expect(source).not.toContain(
            'String(serviceAccount.private_key).trim()',
        );
    });

    it("posts the assertion as the JWT bearer grant", () => {
        expect(source).toContain(
            '"urn:ietf:params:oauth:grant-type:jwt-bearer"',
        );
        expect(source).toContain(
            '"application/x-www-form-urlencoded"',
        );
    });
});
