import { describe, expect, it } from "vitest";

import {
  SUBJECT_GENERATOR_SOURCES,
} from "@zoeskoul/curriculum-registry/runtime";

describe("C data structures publication visibility", () => {
  it("stays private in the canonical live manifest", () => {
    const source =
      SUBJECT_GENERATOR_SOURCES["c-data-structures"];

    expect(source).toBeDefined();
    expect(source.manifest.subject.visibility).toBe("private");
  });
});
