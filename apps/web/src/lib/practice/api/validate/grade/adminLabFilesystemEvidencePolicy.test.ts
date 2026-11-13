import { describe, expect, it } from "vitest";
import { requiresAuthoritativeAdminLabEvidence, requiresCourse2FinalCapstoneFilesystemEvidence, lacksPublishedCourse2FinalFilesystemContract } from "./adminLabFilesystemEvidencePolicy";

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


describe("published Course 2 GET final-step admission", () => {
    const topicBundle = {
        topicId: "final-capstone-secure-project",
        subjectSlug: "linux-files-permissions-users",
        moduleSlug: "linux-module-4-secure-project-capstone",
    };
    const exerciseKey = "final-capstone-secure-project-step-5";
    const contract = {
        adminLabFilesystemExpectations: {
            required: [{ path: "/workspace/secure-project", kind: "directory", mode: "0755", uid: 1000, gid: 1000 }],
        },
    };

    it("rejects absent and malformed private final-step contracts before instance creation", () => {
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: null})).toBe(true);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: {kind: "code_input"}})).toBe(true);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: {adminLabFilesystemExpectations: null}})).toBe(true);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: {adminLabFilesystemExpectations: {required: []}}})).toBe(true);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: {...contract, terminalExpectations: {requiredCommands: []}}})).toBe(true);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: {...contract, tests: [{stdout: "OK"}]}})).toBe(true);
    });

    it("admits only a validated Runner-authoritative private contract", () => {
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: contract})).toBe(false);
    });

    it("does not change Course 1, earlier Course 2 project steps, or unrelated topics", () => {
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey: "final-capstone-secure-project-step-4", expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, subjectSlug: "linux-terminal-fundamentals"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, moduleSlug: "wrong-module"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, topicId: "wrong-topic"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: null, exerciseKey, expected: null})).toBe(false);
    });
});
