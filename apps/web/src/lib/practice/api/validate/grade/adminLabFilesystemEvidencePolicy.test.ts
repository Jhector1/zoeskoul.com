import { describe, expect, it } from "vitest";
import { requiresAuthoritativeAdminLabEvidence } from "./adminLabFilesystemEvidencePolicy";

describe("administrator filesystem evidence guard", () => {
    it("requires Runner evidence for admin filesystem expected payload", () => {
        expect(requiresAuthoritativeAdminLabEvidence({ adminLabFilesystemExpectations: { required: [{path: "/workspace/project", mode: "0750"}] }})).toBe(true);
    });
    it("cannot be bypassed by a null expectation", () => {
        expect(requiresAuthoritativeAdminLabEvidence({ adminLabFilesystemExpectations: null })).toBe(true);
    });
    it("does not alter ordinary web and programming exercises", () => {
        expect(requiresAuthoritativeAdminLabEvidence({ strategy: "programming", tests: [] })).toBe(false);
    });
    it("rejects payloads without an expected object", () => {
        expect(requiresAuthoritativeAdminLabEvidence(null)).toBe(false);
    });
});
