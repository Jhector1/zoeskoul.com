
import { describe, expect, it } from "vitest";

import { normalizeLearnerText } from "./normalizeLearnerText";

describe("normalizeLearnerText", () => {
  it("normalizes apostrophes and whitespace without destroying Kreyòl diacritics", () => {
    expect(
      normalizeLearnerText("  M’ byen,   mèsi!  ", {
        caseFold: true,
        caseFoldLocale: "ht",
      }),
    ).toBe("m' byen, mèsi!");
  });

  it("can ignore punctuation while preserving apostrophes", () => {
    expect(
      normalizeLearnerText("M' byen, mèsi!", {
        caseFold: true,
        stripPunctuation: true,
        preserveApostrophes: true,
      }),
    ).toBe("m' byen mèsi");
  });

  it("normalizes Unicode canonically", () => {
    const decomposed = "mwe\u0300n";
    expect(normalizeLearnerText(decomposed)).toBe(decomposed.normalize("NFC"));
  });
});
