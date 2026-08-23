import { describe, expect, it } from "vitest";

import {
  learnerHref,
  resolveAdminRoute,
} from "./adminRoutes";

describe("Admin Vite route ownership", () => {
  it("owns the compact Admin routes", () => {
    expect(resolveAdminRoute("/")).toEqual({ kind: "overview" });
    expect(resolveAdminRoute("/questions")).toEqual({ kind: "questions" });
    expect(resolveAdminRoute("/curriculum")).toEqual({
      kind: "curriculum",
    });
    expect(resolveAdminRoute("/promotions")).toEqual({ kind: "promotions" });
    expect(resolveAdminRoute("/learners/user%3A123")).toEqual({
      kind: "learner",
      actorKey: "user:123",
    });
  });

  it("keeps old Admin-prefixed paths readable during cutover", () => {
    expect(resolveAdminRoute("/admin")).toEqual({ kind: "overview" });
    expect(resolveAdminRoute("/admin/questions")).toEqual({
      kind: "questions",
    });
    expect(resolveAdminRoute("/admin/promotions")).toEqual({
      kind: "promotions",
    });
    expect(resolveAdminRoute("/admin/learners/guest%3A7")).toEqual({
      kind: "learner",
      actorKey: "guest:7",
    });
  });

  it("builds one canonical learner route", () => {
    expect(learnerHref("guest:abc/123")).toBe(
      "/learners/guest%3Aabc%2F123",
    );
  });
});
