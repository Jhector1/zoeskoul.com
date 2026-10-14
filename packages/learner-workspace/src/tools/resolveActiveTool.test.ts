import { describe, expect, it } from "vitest";

import {
    resolveActiveTool,
    resolveDefaultActiveTool,
} from "./resolveActiveTool";

describe("canonical learner active-tool resolution", () => {
    it("does not manufacture Notes when no tool is enabled", () => {
        expect(
            resolveDefaultActiveTool({
                codeEnabled: false,
                boardEnabled: false,
                notesEnabled: false,
            }),
        ).toBeNull();
    });

    it("ignores an invalid persisted tool id", () => {
        expect(
            resolveActiveTool({
                ctx: {
                    codeEnabled: false,
                    boardEnabled: false,
                    notesEnabled: true,
                },
                persistedTool: "unknown",
            }),
        ).toBe("notes");
    });

    it("selects the runtime code workspace ahead of stale Notes", () => {
        expect(
            resolveActiveTool({
                ctx: {
                    codeEnabled: true,
                    boardEnabled: false,
                    notesEnabled: true,
                },
                persistedTool: "notes",
            }),
        ).toBe("code");
    });

    it("keeps Notes available when the learner context enables it", () => {
        expect(
            resolveActiveTool({
                ctx: {
                    codeEnabled: false,
                    boardEnabled: false,
                    notesEnabled: true,
                },
                persistedTool: "notes",
            }),
        ).toBe("notes");
    });
});
