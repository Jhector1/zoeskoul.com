import { describe, expect, it } from "vitest";

import { buildSqlResultRows } from "./expectedExample";

describe("buildSqlResultRows", () => {
    it("preserves positional values when SQL columns share the same label", () => {
        expect(
            buildSqlResultRows(
                ["id", "id", "name"],
                [[1, 9, "Ada"]],
                12,
            ),
        ).toEqual([[1, 9, "Ada"]]);
    });

    it("normalizes values and respects the preview row limit", () => {
        expect(
            buildSqlResultRows(
                ["active", "total"],
                [
                    [true, BigInt(3)],
                    [false, BigInt(4)],
                ],
                1,
            ),
        ).toEqual([[1, 3]]);
    });
});
