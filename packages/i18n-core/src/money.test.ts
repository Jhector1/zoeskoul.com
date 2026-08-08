import {
  describe,
  expect,
  it,
} from "vitest";

import {
  formatMoneyMinor,
  toIntlLocale,
} from "./money";

describe("toIntlLocale", () => {
  it("maps ZoeSkoul locales to Intl locales", () => {
    expect(toIntlLocale("en")).toBe("en-US");
    expect(toIntlLocale("fr")).toBe("fr-FR");
    expect(toIntlLocale("ht")).toBe("ht-HT");
    expect(toIntlLocale("es")).toBe("es");
  });
});

describe("formatMoneyMinor", () => {
  it("formats two-decimal currencies from minor units", () => {
    expect(
      formatMoneyMinor(
        1234,
        "usd",
        "en-US",
      ),
    ).toBe("$12.34");
  });

  it("preserves zero-decimal currency semantics", () => {
    expect(
      formatMoneyMinor(
        1200,
        "JPY",
        "en-US",
      ),
    ).toBe("¥1,200");
  });
});
