import { describe, expect, it } from "vitest";
import { requiresAuthoritativeAdminLabEvidence, requiresCourse2FinalCapstoneFilesystemEvidence, lacksPublishedCourse2FinalFilesystemContract, matchesCompleteCourse2FinalFilesystemContract } from "./adminLabFilesystemEvidencePolicy";

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
        adminLabPublishedTopicSha256: "a".repeat(64),
        adminLabFilesystemExpectations: {
            required: [
                { path: "/workspace/secure-project", kind: "directory", mode: "0755", uid: 1000, gid: 1000 },
                { path: "/workspace/secure-project/README.md", kind: "file", mode: "0644", uid: 0, gid: 0 },
                { path: "/workspace/secure-project/scripts", kind: "directory", mode: "0700", uid: 1000, gid: 1000 },
                { path: "/workspace/secure-project/scripts/run.sh", kind: "file", mode: "0700", uid: 1000, gid: 1000 },
                { path: "/workspace/secure-project/secrets.env", kind: "file", mode: "0600", uid: 1000, gid: 1000 },
                { path: "/workspace/secure-project/shared", kind: "directory", mode: "0770", uid: 1000, gid: 1000 },
                { path: "/workspace/secure-project/shared/notes.txt", kind: "file", mode: "0640", uid: 1000, gid: 1000 },
            ],
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

    it("admits only a complete, versioned Runner-authoritative private contract", () => {
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey, expected: contract})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey,
            expected: {adminLabFilesystemExpectations: contract.adminLabFilesystemExpectations},
        })).toBe(true);
    });

    it("rejects a partial, duplicated, or weakened final capstone even when schema-valid", () => {
        const required = contract.adminLabFilesystemExpectations.required;
        const check = (rows: typeof required) => lacksPublishedCourse2FinalFilesystemContract({
            topicBundle, exerciseKey,
            expected: {adminLabPublishedTopicSha256: "a".repeat(64), adminLabFilesystemExpectations: {required: rows}},
        });
        expect(check(required.slice(0, 1))).toBe(true);
        expect(check([...required.slice(0, 6), required[0]])).toBe(true);
        expect(check(required.map((row) => row.path.endsWith("secrets.env") ? {...row, mode: "0666"} : row))).toBe(true);
        expect(check(required.map((row) => row.path.endsWith("README.md") ? {...row, uid: 1000} : row))).toBe(true);
        expect(check(required.map((row) => row.path.endsWith("shared/notes.txt") ? {...row, path: "/workspace/other/notes.txt"} : row))).toBe(true);
        expect(matchesCompleteCourse2FinalFilesystemContract({required: [...required].reverse()})).toBe(true);
    });

    it("does not change Course 1, earlier Course 2 project steps, or unrelated topics", () => {
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle, exerciseKey: "final-capstone-secure-project-step-4", expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, subjectSlug: "linux-terminal-fundamentals"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, moduleSlug: "wrong-module"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: {...topicBundle, topicId: "wrong-topic"}, exerciseKey, expected: null})).toBe(false);
        expect(lacksPublishedCourse2FinalFilesystemContract({topicBundle: null, exerciseKey, expected: null})).toBe(false);
    });
});


describe("Course 2 private candidate and strict grading remain aligned", () => {
    it("provides one exact, complete seven-path candidate for an independently pinned release", async () => {
        const policy = await import("./adminLabFilesystemEvidencePolicy");
        const expected = policy.course2FinalFilesystemExpected();
        expect(expected.required).toHaveLength(7);
        expect(policy.matchesCompleteCourse2FinalFilesystemContract(expected)).toBe(true);
    });
});
