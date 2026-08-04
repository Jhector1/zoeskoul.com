import { describe, expect, it } from "vitest";

import {
    PROGRAMMING_TOOL_ORDER,
    buildProgrammingToolHref,
    resolveSandboxToolEntry,
} from "./toolRegistry";

describe("R programming sandbox registration", () => {
    it("registers R as a navigable programming tool", () => {
        expect(PROGRAMMING_TOOL_ORDER).toContain("r");
        expect(buildProgrammingToolHref("en", "r")).toBe(
            "/en/sandbox/programming/r",
        );
    });

    it("resolves the R route to the R runtime", () => {
        expect(resolveSandboxToolEntry("programming", "r")).toMatchObject({
            kind: "programming",
            toolSlug: "r",
            title: "Online R Compiler",
            initialLanguage: "r",
            seoKey: "online-r-compiler",
        });
    });
});
