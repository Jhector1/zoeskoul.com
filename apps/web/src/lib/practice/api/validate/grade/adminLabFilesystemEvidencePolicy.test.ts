import { describe, expect, it } from "vitest";
import { requiresAuthoritativeAdminLabEvidence, requiresCourse2FinalCapstoneFilesystemEvidence } from "./adminLabFilesystemEvidencePolicy";

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


describe("Course 2 final capstone grading scope", () => {
    const instance = {
        exerciseKey: "final-capstone-secure-project-step-5",
        topic: {
            slug: "linux-files-permissions-users.final-capstone-secure-project",
            subject: { slug: "linux-files-permissions-users" },
            module: { slug: "linux-module-4-secure-project-capstone" },
        },
    };
    it("requires trusted evidence only for the exact DB-resolved final step", () => {
        expect(requiresCourse2FinalCapstoneFilesystemEvidence(instance)).toBe(true);
        expect(requiresCourse2FinalCapstoneFilesystemEvidence({
            ...instance, topic: {...instance.topic, slug: "final-capstone-secure-project"},
        })).toBe(true);
        expect(requiresCourse2FinalCapstoneFilesystemEvidence({
            ...instance, exerciseKey: "final-capstone-secure-project-step-4",
        })).toBe(false);
        expect(requiresCourse2FinalCapstoneFilesystemEvidence({
            ...instance, topic: {...instance.topic, subject: {slug: "linux-terminal-fundamentals"}},
        })).toBe(false);
        expect(requiresCourse2FinalCapstoneFilesystemEvidence({
            ...instance, topic: {...instance.topic, module: {slug: "wrong-module"}},
        })).toBe(false);
        expect(requiresCourse2FinalCapstoneFilesystemEvidence(null)).toBe(false);
    });
});
