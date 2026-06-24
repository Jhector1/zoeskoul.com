import { describe, expect, it } from "vitest";
import { parseCompileCourseArgs } from "./compile-course.js";

describe("compile-course CLI args", () => {
    it("parses explicit live subject", () => {
        expect(parseCompileCourseArgs(["--live-subject", "sql-preview"])).toEqual({
            draftOnly: false,
            liveSubjectSlug: "sql-preview",
            resume: false,
            forceLiveOverwrite: false,
            rebuildFromDrafts: false,
            upgradeDrafts: false,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });

    it("parses resume", () => {
        expect(parseCompileCourseArgs(["--resume"])).toEqual({
            draftOnly: false,
            liveSubjectSlug: undefined,
            resume: true,
            forceLiveOverwrite: false,
            rebuildFromDrafts: false,
            upgradeDrafts: false,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });

    it("parses draft-only", () => {
        expect(parseCompileCourseArgs(["--draft-only", "--resume"])).toEqual({
            draftOnly: true,
            liveSubjectSlug: undefined,
            resume: true,
            forceLiveOverwrite: false,
            rebuildFromDrafts: false,
            upgradeDrafts: false,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });

    it("parses forced live overwrite", () => {
        expect(
            parseCompileCourseArgs([
                "--live-subject",
                "sql",
                "--force-live-overwrite",
            ]),
        ).toEqual({
            draftOnly: false,
            liveSubjectSlug: "sql",
            resume: false,
            forceLiveOverwrite: true,
            rebuildFromDrafts: false,
            upgradeDrafts: false,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });


    it("parses rebuild from saved drafts", () => {
        expect(
            parseCompileCourseArgs(["--draft-only", "--rebuild-from-drafts"]),
        ).toEqual({
            draftOnly: true,
            liveSubjectSlug: undefined,
            resume: false,
            forceLiveOverwrite: false,
            rebuildFromDrafts: true,
            upgradeDrafts: false,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });

    it("parses upgrade drafts", () => {
        expect(parseCompileCourseArgs(["--draft-only", "--upgrade-drafts"])).toEqual({
            draftOnly: true,
            liveSubjectSlug: undefined,
            resume: false,
            forceLiveOverwrite: false,
            rebuildFromDrafts: false,
            upgradeDrafts: true,
            preferCurrentDraftOutput: false,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "reports",
        });
    });

    it("requires draft-only for rebuild from saved drafts", () => {
        expect(() => parseCompileCourseArgs(["--rebuild-from-drafts"])).toThrow(
            /requires --draft-only/,
        );
    });

    it("requires draft-only for draft upgrade", () => {
        expect(() => parseCompileCourseArgs(["--upgrade-drafts"])).toThrow(
            /requires --draft-only/,
        );
    });

    it("does not allow rebuild and upgrade together", () => {
        expect(() =>
            parseCompileCourseArgs([
                "--draft-only",
                "--rebuild-from-drafts",
                "--upgrade-drafts",
            ]),
        ).toThrow(/cannot be used together/);
    });


    it("parses current draft output source preference", () => {
        expect(
            parseCompileCourseArgs([
                "--draft-only",
                "--rebuild-from-drafts",
                "--prefer-current-draft-output",
            ]),
        ).toMatchObject({
            draftOnly: true,
            rebuildFromDrafts: true,
            preferCurrentDraftOutput: true,
            preferReports: false,
            syncReports: true,
            rebuildDraftSource: "current-output",
        });
    });

    it("can disable report sync for rebuild mode", () => {
        expect(
            parseCompileCourseArgs([
                "--draft-only",
                "--rebuild-from-drafts",
                "--no-sync-reports",
            ]),
        ).toMatchObject({
            draftOnly: true,
            rebuildFromDrafts: true,
            syncReports: false,
            rebuildDraftSource: "reports",
        });
    });

    it("does not allow both rebuild source preferences", () => {
        expect(() =>
            parseCompileCourseArgs([
                "--draft-only",
                "--rebuild-from-drafts",
                "--prefer-current-draft-output",
                "--prefer-reports",
            ]),
        ).toThrow(/cannot be used together/);
    });

    it("requires rebuild mode for rebuild source preferences", () => {
        expect(() =>
            parseCompileCourseArgs([
                "--draft-only",
                "--prefer-current-draft-output",
            ]),
        ).toThrow(/require --rebuild-from-drafts/);
    });

    it("requires rebuild mode before disabling report sync", () => {
        expect(() => parseCompileCourseArgs(["--draft-only", "--no-sync-reports"])).toThrow(
            /requires --rebuild-from-drafts/,
        );
    });

    it("requires a live subject value", () => {
        expect(() => parseCompileCourseArgs(["--live-subject"])).toThrow(
            /requires a live subject slug/,
        );
    });
});
