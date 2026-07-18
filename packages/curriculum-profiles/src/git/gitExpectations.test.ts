import { describe, expect, it } from "vitest";
import { buildGitExpectationsHiddenShellCheck } from "./gitExpectations.js";

describe("buildGitExpectationsHiddenShellCheck", () => {
    it("builds repository, branch, history, file, and local-remote checks", () => {
        const check = buildGitExpectationsHiddenShellCheck({
            repositoryPath: "community-site",
            repositoryInitialized: true,
            currentBranch: "main",
            cleanWorkingTree: true,
            minimumCommitCount: 2,
            trackedFiles: ["README.md"],
            untrackedFiles: ["notes.tmp"],
            ignoredFiles: ["preview.log"],
            forbiddenTrackedFiles: ["preview.log"],
            requiredBranches: ["main", "feature/navigation"],
            forbiddenBranches: ["old-navigation"],
            commitMessages: [{ position: 0, matches: "^Add navigation$" }],
            headFiles: [{ path: "README.md", contains: "Community" }],
            remotes: [
                {
                    name: "origin",
                    urlContains: "community-site.git",
                    requiredBranches: ["main"],
                },
            ],
        });

        expect(check?.timeoutMs).toBe(15_000);
        expect(check?.script).toContain("command -v git");
        expect(check?.script).toContain("git -C \"$repo\"");
        expect(check?.script).toContain("branch --show-current");
        expect(check?.script).toContain("status --porcelain");
        expect(check?.script).toContain("rev-list --count HEAD");
        expect(check?.script).toContain("HEAD~0^{commit}");
        expect(check?.script).toContain("check-ignore -q");
        expect(check?.script).toContain("show-ref --verify");
        expect(check?.script).toContain("git -C \"$repo\" show");
        expect(check?.script).toContain("remote get-url");
        expect(check?.script).toContain("ls-remote --exit-code --heads");
        expect(check?.script).not.toMatch(/[0-9a-f]{40}/);
    });

    it("supports checking that a folder has not been initialized yet", () => {
        const check = buildGitExpectationsHiddenShellCheck({
            repositoryPath: "field-notes",
            repositoryInitialized: false,
        });

        expect(check?.script).toContain(
            "Expected field-notes not to be a Git repository yet.",
        );
    });
});
