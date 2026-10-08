import { describe, expect, it } from "vitest";

import { resolveDepartmentPresentation } from "./departments";

describe("resolveDepartmentPresentation", () => {
  it("groups programming and systems catalogs into Computer Science", () => {
    expect(
      resolveDepartmentPresentation({ catalogFamily: "programming" }),
    ).toEqual({ id: "computer-science", title: "Computer Science" });

    expect(
      resolveDepartmentPresentation({ catalogFamily: "systems" }),
    ).toEqual({ id: "computer-science", title: "Computer Science" });
  });

  it("keeps language catalogs in Languages", () => {
    expect(
      resolveDepartmentPresentation({ catalogFamily: "languages" }),
    ).toEqual({ id: "languages", title: "Languages" });
  });

  it("turns a future catalog family into a stable department key without code changes", () => {
    expect(
      resolveDepartmentPresentation({ catalogFamily: "health-sciences" }),
    ).toEqual({ id: "health-sciences", title: "Health Sciences" });
  });
});
