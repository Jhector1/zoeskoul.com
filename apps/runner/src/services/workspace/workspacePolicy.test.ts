import { describe, expect, it } from "vitest";
import {
    isAllowedWorkspaceFile,
    normalizeWorkspaceEntries,
} from "./workspacePolicy.js";

describe("workspacePolicy", () => {
    it("allows .keep files in starter workspaces", () => {
        expect(isAllowedWorkspaceFile("backups/.keep")).toBe(true);
    });

    it("allows Linux lab temporary files", () => {
        expect(isAllowedWorkspaceFile("inbox/temp.tmp")).toBe(true);
        expect(isAllowedWorkspaceFile("messy-inbox/old.tmp")).toBe(true);
    });

    it("allows Linux lab log files", () => {
        expect(isAllowedWorkspaceFile("logs/app.log")).toBe(true);
    });

    it("normalizes workspace entries that include .keep files", () => {
        expect(
            normalizeWorkspaceEntries([
                {
                    kind: "directory",
                    path: "backups",
                },
                {
                    kind: "file",
                    path: "backups/.keep",
                    content: "",
                },
            ]),
        ).toEqual([
            {
                kind: "directory",
                path: "backups",
            },
            {
                kind: "file",
                path: "backups/.keep",
                content: "",
            },
        ]);
    });
});