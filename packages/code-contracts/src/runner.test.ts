import { describe, expect, it } from "vitest";

import {
    interactiveLanguageSchema,
    isInteractiveLanguage,
    isRunnerCodeLanguage,
    isRunnerLanguage,
    isWorkspaceLanguage,
    runnerLanguageSchema,
    workspaceLanguageSchema,
} from "./runner.js";

describe("R language contracts", () => {
    it("accepts R across workspace and runner language contracts", () => {
        expect(workspaceLanguageSchema.parse("r")).toBe("r");
        expect(runnerLanguageSchema.parse("r")).toBe("r");
        expect(interactiveLanguageSchema.parse("r")).toBe("r");

        expect(isWorkspaceLanguage("r")).toBe(true);
        expect(isRunnerLanguage("r")).toBe(true);
        expect(isRunnerCodeLanguage("r")).toBe(true);
        expect(isInteractiveLanguage("r")).toBe(true);
    });
});
