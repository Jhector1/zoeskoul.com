import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCompiler = vi.hoisted(() => ({
    resolveAuthoringCompileTarget: vi.fn(),
    backupCurrentDraftCourse: vi.fn(),
    restoreCourseBackupToDraft: vi.fn(),
    listCourseBackupKeys: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-compiler", () => ({
    resolveAuthoringCompileTarget: mockedCompiler.resolveAuthoringCompileTarget,
    backupCurrentDraftCourse: mockedCompiler.backupCurrentDraftCourse,
    restoreCourseBackupToDraft: mockedCompiler.restoreCourseBackupToDraft,
    listCourseBackupKeys: mockedCompiler.listCourseBackupKeys,
}));

import {
    parseBackupCourseDraftArgs,
    parseRestoreCourseDraftArgs,
    runBackupCourseDraft,
    runRestoreCourseDraft,
} from "./course-draft-backups.js";

describe("course draft backup CLI args", () => {
    it("parses optional manual backup key", () => {
        expect(parseBackupCourseDraftArgs(["--backup-key", "manual-key"])).toEqual({
            backupKey: "manual-key",
        });
    });

    it("requires a backup key for restore", () => {
        expect(() => parseRestoreCourseDraftArgs([])).toThrow(
            /requires --backup-key/,
        );
    });

    it("parses restore force and backup subject", () => {
        expect(
            parseRestoreCourseDraftArgs([
                "--backup-key",
                "python-data-functions--draft--2026-07-01--12-00-00",
                "--backup-subject",
                "python--python-data-functions--draft",
                "--force",
            ]),
        ).toEqual({
            backupKey: "python-data-functions--draft--2026-07-01--12-00-00",
            backupSubjectSlug: "python--python-data-functions--draft",
            force: true,
        });
    });
});

describe("course draft backup commands", () => {
    beforeEach(() => {
        mockedCompiler.resolveAuthoringCompileTarget.mockReset();
        mockedCompiler.backupCurrentDraftCourse.mockReset();
        mockedCompiler.restoreCourseBackupToDraft.mockReset();
        mockedCompiler.listCourseBackupKeys.mockReset();
    });

    it("backs up the resolved checked draft subject", async () => {
        mockedCompiler.resolveAuthoringCompileTarget.mockResolvedValueOnce({
            authoringSubjectSlug: "python",
            courseSlug: "python-data-functions",
            liveSubjectSlug: "python--python-data-functions--draft",
        });
        mockedCompiler.backupCurrentDraftCourse.mockResolvedValueOnce({
            ok: true,
            backupKey: "manual-key",
        });

        await runBackupCourseDraft("python", "python-data-functions", [
            "--backup-key",
            "manual-key",
        ]);

        expect(mockedCompiler.resolveAuthoringCompileTarget).toHaveBeenCalledWith({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                draftOnly: true,
            },
        });
        expect(mockedCompiler.backupCurrentDraftCourse).toHaveBeenCalledWith({
            draftSubjectSlug: "python--python-data-functions--draft",
            courseSlug: "python-data-functions",
            backupKey: "manual-key",
        });
    });

    it("restores a backup into the resolved checked draft subject", async () => {
        mockedCompiler.resolveAuthoringCompileTarget.mockResolvedValueOnce({
            authoringSubjectSlug: "python",
            courseSlug: "python-data-functions",
            liveSubjectSlug: "python--python-data-functions--draft",
        });
        mockedCompiler.restoreCourseBackupToDraft.mockResolvedValueOnce({
            ok: true,
            backupKey: "old-key",
            sourceSubjectSlug: "python-v2",
            draftSubjectSlug: "python--python-data-functions--draft",
        });

        await runRestoreCourseDraft("python", "python-data-functions", [
            "--backup-key",
            "old-key",
            "--force",
        ]);

        expect(mockedCompiler.restoreCourseBackupToDraft).toHaveBeenCalledWith({
            catalogSubjectSlug: "python",
            draftSubjectSlug: "python--python-data-functions--draft",
            courseSlug: "python-data-functions",
            backupKey: "old-key",
            backupSubjectSlug: undefined,
            force: true,
        });
    });
});
