import { describe, expect, it } from "vitest";
import { normalizeGitExpectations } from "./git-expectations.js";

describe("normalizeGitExpectations", () => {
    it("normalizes repository-state expectations without commit hashes", () => {
        expect(
            normalizeGitExpectations({
                repositoryPath: "community-site",
                repositoryInitialized: true,
                currentBranch: "main",
                cleanWorkingTree: true,
                exactCommitCount: 2,
                trackedFiles: ["README.md", "README.md", "src/index.html"],
                ignoredFiles: ["preview.log"],
                requiredBranches: ["main", "feature/navigation"],
                commitMessages: [
                    { position: 0, matches: "^Add navigation$" },
                ],
                headFiles: [
                    { path: "README.md", contains: "Community site" },
                ],
                remotes: [
                    {
                        name: "origin",
                        urlContains: "community-site.git",
                        requiredBranches: ["main"],
                    },
                ],
            }),
        ).toEqual({
            repositoryPath: "community-site",
            repositoryInitialized: true,
            currentBranch: "main",
            cleanWorkingTree: true,
            exactCommitCount: 2,
            trackedFiles: ["README.md", "src/index.html"],
            ignoredFiles: ["preview.log"],
            requiredBranches: ["main", "feature/navigation"],
            commitMessages: [
                { position: 0, matches: "^Add navigation$" },
            ],
            headFiles: [
                { path: "README.md", contains: "Community site" },
            ],
            remotes: [
                {
                    name: "origin",
                    urlContains: "community-site.git",
                    requiredBranches: ["main"],
                },
            ],
        });
    });

    it("accepts an empty exact HEAD file", () => {
        expect(
            normalizeGitExpectations({
                headFiles: [{ path: "empty.txt", equals: "" }],
            }),
        ).toEqual({
            headFiles: [{ path: "empty.txt", equals: "" }],
        });
    });

    it("rejects an empty Git expectation contract", () => {
        expect(() => normalizeGitExpectations({})).toThrow(
            /at least one repository-state assertion/i,
        );
        expect(normalizeGitExpectations(undefined)).toBeUndefined();
    });

    it("rejects unsafe repository and file paths", () => {
        expect(() =>
            normalizeGitExpectations({ repositoryPath: "../repo" }),
        ).toThrow(/unsafe workspace path/i);

        expect(() =>
            normalizeGitExpectations({
                trackedFiles: ["/absolute.txt"],
            }),
        ).toThrow(/absolute path/i);
    });

    it("rejects contradictory not-a-repository expectations", () => {
        expect(() =>
            normalizeGitExpectations({
                repositoryInitialized: false,
                currentBranch: "main",
            }),
        ).toThrow(/cannot be false/i);
    });

    it("rejects contradictory repository-state requirements", () => {
        expect(() =>
            normalizeGitExpectations({
                minimumCommitCount: 3,
                exactCommitCount: 2,
            }),
        ).toThrow(/smaller than minimumCommitCount/i);

        expect(() =>
            normalizeGitExpectations({
                trackedFiles: ["preview.log"],
                forbiddenTrackedFiles: ["preview.log"],
            }),
        ).toThrow(/require and forbid the same tracked file/i);

        expect(() =>
            normalizeGitExpectations({
                requiredBranches: ["feature/docs"],
                forbiddenBranches: ["feature/docs"],
            }),
        ).toThrow(/require and forbid the same branch/i);

        expect(() =>
            normalizeGitExpectations({
                exactCommitCount: 0,
                headFiles: [{ path: "README.md", contains: "Guide" }],
            }),
        ).toThrow(/cannot be 0/i);
    });
});
