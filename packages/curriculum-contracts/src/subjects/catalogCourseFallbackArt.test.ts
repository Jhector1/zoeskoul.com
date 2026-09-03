
import { describe, expect, it } from "vitest";
import {
  CATALOG_COURSE_FALLBACK_ART_VARIANT_COUNT,
  resolveCatalogCourseFallbackArtVariant,
} from "./catalogCourseStatus";

describe("resolveCatalogCourseFallbackArtVariant", () => {
  it("is stable for the same canonical course identity", () => {
    expect(resolveCatalogCourseFallbackArtVariant("python-data-functions")).toBe(
      resolveCatalogCourseFallbackArtVariant("python-data-functions"),
    );
  });

  it("normalizes harmless case and whitespace differences", () => {
    expect(resolveCatalogCourseFallbackArtVariant("  PYTHON-V2  ")).toBe(
      resolveCatalogCourseFallbackArtVariant("python-v2"),
    );
  });

  it("keeps variants inside the approved palette", () => {
    const identities = [
      "python",
      "python-v2",
      "python-data-functions",
      "applied-python-projects",
      "sql",
      "sql-v2",
      "sql-analysis-reporting",
      "multi-table-sql",
      "git-foundations",
      "linux-terminal-fundamentals",
    ];

    for (const identity of identities) {
      const variant = resolveCatalogCourseFallbackArtVariant(identity);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(
        CATALOG_COURSE_FALLBACK_ART_VARIANT_COUNT,
      );
    }
  });

  it("gives the current Python catalog more than one fallback treatment", () => {
    const variants = new Set(
      [
        "python",
        "python-v2",
        "python-data-functions",
        "applied-python-projects",
      ].map(resolveCatalogCourseFallbackArtVariant),
    );

    expect(variants.size).toBeGreaterThan(1);
  });

  it("uses the neutral first variant for an empty identity", () => {
    expect(resolveCatalogCourseFallbackArtVariant("")).toBe(0);
  });
});
