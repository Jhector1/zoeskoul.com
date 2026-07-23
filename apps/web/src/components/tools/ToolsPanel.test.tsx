import { describe, expect, it } from "vitest";

import { resolveCompactToolsHeaderModel } from "./ToolsPanel";

describe("resolveCompactToolsHeaderModel", () => {
    const baseCtx = {
        subjectSlug: "python",
        moduleId: "module-1",
        locale: "en",
        boundId: null,
        codeEnabled: true,
        boardEnabled: false,
        notesEnabled: true,
    };

    it("keeps Run as the primary action in compact mode", () => {
        const model = resolveCompactToolsHeaderModel({
            compactToolsHeader: true,
            ctx: baseCtx,
        });

        expect(model.primarySpec?.id).toBe("code");
        expect(model.secondarySpecs.map((spec) => spec.id)).toEqual(["notes"]);
    });

    it("falls back to Notes when code is unavailable", () => {
        const model = resolveCompactToolsHeaderModel({
            compactToolsHeader: true,
            ctx: {
                ...baseCtx,
                codeEnabled: false,
            },
        });

        expect(model.primarySpec?.id).toBe("notes");
        expect(model.secondarySpecs).toEqual([]);
    });

    it("does not move tabs into a compact menu outside compact mode", () => {
        const model = resolveCompactToolsHeaderModel({
            compactToolsHeader: false,
            ctx: baseCtx,
        });

        expect(model.primarySpec?.id).toBe("code");
        expect(model.secondarySpecs).toEqual([]);
    });
});
