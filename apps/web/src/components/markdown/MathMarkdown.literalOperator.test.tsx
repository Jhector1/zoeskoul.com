import { describe, expect, it } from "vitest";

import { shouldRenderLiteralOperatorContent } from "./MathMarkdown";

describe("shouldRenderLiteralOperatorContent", () => {
    it.each([">", ">>", "..", "~", "&&", "||", "<=", ">=", "!=", "+", "-"])(
        "treats %s as literal operator content",
        (value) => {
            expect(shouldRenderLiteralOperatorContent(value)).toBe(true);
        },
    );

    it.each([
        "Run code",
        "cd ..",
        "`>`",
        "2 > 1",
        "A",
        "",
    ])("leaves normal Markdown content unchanged: %s", (value) => {
        expect(shouldRenderLiteralOperatorContent(value)).toBe(false);
    });
});
