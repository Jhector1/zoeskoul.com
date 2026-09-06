import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeEmails,
  normalizeEmailValue,
} from "./emailNormalization";

describe("canonical email normalization", () => {
  it("removes copy/paste zero-width characters and normalizes case", () => {
    expect(
      normalizeEmailValue(
        "  Pharaone04\u200B@GMAIL.COM\uFEFF ",
      ),
    ).toBe("pharaone04@gmail.com");
  });

  it("deduplicates normalized addresses", () => {
    expect(
      normalizeEmails([
        "A@example.com",
        " a@example.com ",
        "B@example.com",
      ]),
    ).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("does not erase ordinary invalid internal spaces", () => {
    expect(
      normalizeEmailValue(
        "bad user@example.com",
      ),
    ).toBe("bad user@example.com");
  });
});
