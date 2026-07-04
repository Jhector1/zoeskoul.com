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
});
