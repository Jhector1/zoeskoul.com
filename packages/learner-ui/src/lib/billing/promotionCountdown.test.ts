import { describe, expect, it } from "vitest";

import { formatPromotionCountdown } from "./promotionCountdown";

describe("formatPromotionCountdown", () => {
  it("uses days instead of accumulating very large hour totals", () => {
    expect(
      formatPromotionCountdown(
        (((10 * 24 + 10) * 60 + 46) * 60 + 1) * 1000,
      ),
    ).toBe("10d 10h 46m 01s");
  });

  it("drops empty leading units as the offer gets closer", () => {
    expect(formatPromotionCountdown(((10 * 60 + 46) * 60 + 1) * 1000))
      .toBe("10h 46m 01s");
    expect(formatPromotionCountdown((46 * 60 + 1) * 1000))
      .toBe("46m 01s");
    expect(formatPromotionCountdown(41 * 1000))
      .toBe("41s");
  });

  it("rounds a partial final second up and clamps expired values", () => {
    expect(formatPromotionCountdown(1)).toBe("1s");
    expect(formatPromotionCountdown(0)).toBe("0s");
    expect(formatPromotionCountdown(-1000)).toBe("0s");
  });
});
