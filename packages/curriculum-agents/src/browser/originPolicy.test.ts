import { describe, expect, it } from "vitest";

import {
  createOriginPolicy,
  isAllowedNavigationUrl,
} from "./originPolicy.js";

describe("student agent origin policy", () => {
  it("allows the learner app origin", () => {
    const policy = createOriginPolicy(
      "http://localhost:3002/en/catalogs/sql",
    );

    expect(
      isAllowedNavigationUrl(
        "http://localhost:3002/en/sql/modules/module-0/learn",
        policy,
      ),
    ).toBe(true);
  });

  it("allows explicitly configured auth origins", () => {
    const policy = createOriginPolicy(
      "http://localhost:3002/en",
      ["http://localhost:3000"],
    );

    expect(
      isAllowedNavigationUrl(
        "http://localhost:3000/api/auth/signin",
        policy,
      ),
    ).toBe(true);
  });

  it("rejects file, data, and unapproved web origins", () => {
    const policy = createOriginPolicy("http://localhost:3002/en");

    expect(
      isAllowedNavigationUrl("file:///tmp/solution.json", policy),
    ).toBe(false);
    expect(
      isAllowedNavigationUrl("data:text/plain,solution", policy),
    ).toBe(false);
    expect(
      isAllowedNavigationUrl("https://example.com/answer", policy),
    ).toBe(false);
  });
});
