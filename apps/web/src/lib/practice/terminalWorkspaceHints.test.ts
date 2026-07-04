import { describe, expect, it } from "vitest";

import {
    applyTerminalWorkspaceHintsToEntries,
    applyTerminalWorkspaceHintsToPathSets,
} from "./terminalWorkspaceHints";

describe("terminalWorkspaceHints", () => {
    it("ignores failed mv hints with a missing source path before later successful commands", () => {
        const entries = applyTerminalWorkspaceHintsToEntries({
            entries: [
                { kind: "file", path: "student-notes-organizer/inbox/math.txt", content: "" },
                { kind: "file", path: "student-notes-organizer/inbox/history.txt", content: "" },
            ],
            terminalEvidence: {
                commands: [
                    "mkdir student-notes-organizer/backups",
                    "mv student-notes-organizers/inbox/math.txt student-notes-organizer/classes",
                    "mkdir student-notes-organizer/classes",
                    "mv student-notes-organizer/inbox/math.txt student-notes-organizer/classes",
                    "mv student-notes-organizer/inbox/history.txt student-notes-organizer/classes",
                    "cp student-notes-organizer/classes/history.txt student-notes-organizer/backups/history.txt",
                ],
            },
        });

        const filePaths = entries
            .filter((entry) => entry.kind !== "directory")
            .map((entry) => entry.path)
            .sort();

        expect(filePaths).toEqual([
            "student-notes-organizer/backups/history.txt",
            "student-notes-organizer/classes/history.txt",
            "student-notes-organizer/classes/math.txt",
        ]);
    });

    it("does not let a failed mv command block a later mkdir in path-set validation", () => {
        const submittedFilePaths = new Set<string>([
            "student-notes-organizer/inbox/math.txt",
            "student-notes-organizer/inbox/history.txt",
        ]);
        const submittedFolderPaths = new Set<string>([
            "student-notes-organizer",
            "student-notes-organizer/inbox",
        ]);

        applyTerminalWorkspaceHintsToPathSets({
            submittedFilePaths,
            submittedFolderPaths,
            terminalEvidence: {
                commands: [
                    "mkdir student-notes-organizer/backups",
                    "mv student-notes-organizers/inbox/math.txt student-notes-organizer/classes",
                    "mkdir student-notes-organizer/classes",
                    "mv student-notes-organizer/inbox/math.txt student-notes-organizer/classes",
                    "mv student-notes-organizer/inbox/history.txt student-notes-organizer/classes",
                    "cp student-notes-organizer/classes/history.txt student-notes-organizer/backups/history.txt",
                ],
            },
        });

        expect([...submittedFilePaths].sort()).toEqual([
            "student-notes-organizer/backups/history.txt",
            "student-notes-organizer/classes/history.txt",
            "student-notes-organizer/classes/math.txt",
        ]);
        expect(submittedFolderPaths.has("student-notes-organizer/classes")).toBe(true);
        expect(submittedFolderPaths.has("student-notes-organizer/backups")).toBe(true);
    });

    it("resolves a relative mv command from terminalEvidence.cwd", () => {
        const submittedFilePaths = new Set<string>([
            "sign-shop/banner-note.txt",
        ]);
        const submittedFolderPaths = new Set<string>([
            "sign-shop",
            "sign-shop/handoff",
        ]);

        applyTerminalWorkspaceHintsToPathSets({
            submittedFilePaths,
            submittedFolderPaths,
            terminalEvidence: {
                cwd: "/workspace/sign-shop",
                commands: [
                    "mv banner-note.txt handoff/banner-note.txt",
                ],
            },
        });

        expect(submittedFilePaths.has("sign-shop/banner-note.txt")).toBe(false);
        expect(
            submittedFilePaths.has("sign-shop/handoff/banner-note.txt"),
        ).toBe(true);
    });

    it("resolves a relative rm command from terminalEvidence.cwd", () => {
        const submittedFilePaths = new Set<string>([
            "cleanup-desk/temp-label.txt",
        ]);
        const submittedFolderPaths = new Set<string>([
            "cleanup-desk",
        ]);

        applyTerminalWorkspaceHintsToPathSets({
            submittedFilePaths,
            submittedFolderPaths,
            terminalEvidence: {
                cwd: "/workspace/cleanup-desk",
                commands: ["rm temp-label.txt"],
            },
        });

        expect(submittedFilePaths.has("cleanup-desk/temp-label.txt")).toBe(false);
    });

    it("resolves redirected files relative to terminalEvidence.cwd", () => {
        const submittedFilePaths = new Set<string>();
        const submittedFolderPaths = new Set<string>([
            "visitor-desk",
        ]);

        applyTerminalWorkspaceHintsToPathSets({
            submittedFilePaths,
            submittedFolderPaths,
            terminalEvidence: {
                cwd: "/workspace/visitor-desk",
                commands: ['echo "Welcome" > welcome-note.txt'],
            },
        });

        expect(
            submittedFilePaths.has("visitor-desk/welcome-note.txt"),
        ).toBe(true);
    });


});
