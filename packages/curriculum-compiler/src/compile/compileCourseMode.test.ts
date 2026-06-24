import { describe, expect, it } from "vitest";
import { resolveCompileCourseModeOptions } from "./compileCourse.js";

describe("compileCourse mode options", () => {
    it("defaults to AI generation mode", () => {
        expect(resolveCompileCourseModeOptions({})).toEqual({
            mode: "generate",
            rebuildDraftSource: "reports",
            syncReports: true,
        });
    });

    it("allows deterministic rebuild mode only with draft-only", () => {
        expect(
            resolveCompileCourseModeOptions({
                draftOnly: true,
                rebuildFromDrafts: true,
            }),
        ).toEqual({
            mode: "rebuild-from-drafts",
            rebuildDraftSource: "reports",
            syncReports: true,
        });
    });

    it("allows draft upgrade mode only with draft-only", () => {
        expect(
            resolveCompileCourseModeOptions({
                draftOnly: true,
                upgradeDrafts: true,
            }),
        ).toEqual({
            mode: "upgrade-drafts",
            rebuildDraftSource: "reports",
            syncReports: true,
        });
    });


    it("allows rebuild mode to prefer current draft output", () => {
        expect(
            resolveCompileCourseModeOptions({
                draftOnly: true,
                rebuildFromDrafts: true,
                rebuildDraftSource: "current-output",
            }),
        ).toEqual({
            mode: "rebuild-from-drafts",
            rebuildDraftSource: "current-output",
            syncReports: true,
        });
    });

    it("allows rebuild mode to disable report sync", () => {
        expect(
            resolveCompileCourseModeOptions({
                draftOnly: true,
                rebuildFromDrafts: true,
                syncReports: false,
            }),
        ).toEqual({
            mode: "rebuild-from-drafts",
            rebuildDraftSource: "reports",
            syncReports: false,
        });
    });

    it("rejects rebuild source without rebuild mode", () => {
        expect(() =>
            resolveCompileCourseModeOptions({
                draftOnly: true,
                rebuildDraftSource: "current-output",
            }),
        ).toThrow(/requires --rebuild-from-drafts/);
    });

    it("rejects rebuild mode outside draft-only output", () => {
        expect(() =>
            resolveCompileCourseModeOptions({ rebuildFromDrafts: true }),
        ).toThrow(/requires --draft-only/);
    });

    it("rejects upgrade mode outside draft-only output", () => {
        expect(() => resolveCompileCourseModeOptions({ upgradeDrafts: true })).toThrow(
            /requires --draft-only/,
        );
    });

    it("rejects rebuild and upgrade together", () => {
        expect(() =>
            resolveCompileCourseModeOptions({
                draftOnly: true,
                rebuildFromDrafts: true,
                upgradeDrafts: true,
            }),
        ).toThrow(/cannot be used together/);
    });
});
