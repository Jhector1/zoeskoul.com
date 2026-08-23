import { describe, expect, it } from "vitest";

import { resolveAdminRoute } from "./adminRoutes";

describe("Public Challenges Admin route", () => {
  it("resolves the canonical and compatibility paths", () => {
    expect(resolveAdminRoute("/public-challenges")).toEqual({
      kind: "public-challenges",
    });

    expect(resolveAdminRoute("/admin/public-challenges")).toEqual({
      kind: "public-challenges",
    });
  });
});
