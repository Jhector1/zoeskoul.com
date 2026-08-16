import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    new URL("./useReviewPanels.ts", import.meta.url),
    "utf8",
);
const compactSource = source.replace(/\s+/g, " ");

describe("useReviewPanels callback identity", () => {
    it("depends on stable panel setters instead of the fresh panels wrapper", () => {
        expect(compactSource).toContain(
            "}, [panels.setLeftCollapsed, showDesktopLeft]);",
        );
        expect(
            compactSource.match(
                /\}, \[panels\.setRightCollapsed\]\);/g,
            ) ?? [],
        ).toHaveLength(2);
        expect(
            compactSource.match(
                /\}, \[panels\.setLeftCollapsed\]\);/g,
            ) ?? [],
        ).toHaveLength(1);

        expect(compactSource).not.toContain(
            "}, [showDesktopLeft, panels]);",
        );
        expect(compactSource).not.toContain("}, [panels]);");
    });
});
