import { describe, expect, it } from "vitest";
import { normalizeWorkspaceExpectations } from "./workspace-path.js";

describe("normalizeWorkspaceExpectations", () => {
    it("accepts required files and folders with safe POSIX paths", () => {
        expect(
            normalizeWorkspaceExpectations({
                requiredFiles: ["helpers/formatting.py"],
                requiredFolders: ["helpers"],
            }),
        ).toEqual({
            requiredFiles: ["helpers/formatting.py"],
            requiredFolders: ["helpers"],
        });
    });

    it("rejects unsafe workspace expectation paths", () => {
        for (const badPath of [
            "../secret.txt",
            "/absolute/path.txt",
            "helpers//formatting.py",
            "helpers\\formatting.py",
        ]) {
            expect(() =>
                normalizeWorkspaceExpectations({
                    requiredFiles: [badPath],
                }),
            ).toThrow(/workspace|path|unsafe|invalid/i);
        }
    });
});
