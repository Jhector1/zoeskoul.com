import { describe, expect, it } from "vitest";
import {
  buildAccessGateSearchParams,
  buildAuthenticateAccessHref,
  safeAccessPath,
} from "./accessGate";

describe("access gate continuation", () => {
  it("shares one safe continuation contract across account and billing gates", () => {
    const params = buildAccessGateSearchParams({
      next: "/en/subjects/c/modules/m1",
      back: "/en/subjects/c/modules",
      reason: "payment_required",
      subject: "c",
      module: "m1",
    });

    expect(params.get("next")).toBe("/en/subjects/c/modules/m1");
    expect(params.get("callbackUrl")).toBe("/en/subjects/c/modules/m1");
    expect(params.get("reason")).toBe("payment_required");
  });

  it("builds a localized account gate for course invitations", () => {
    expect(
      buildAuthenticateAccessHref({
        locale: "fr",
        next: "/fr/invitations/course/token",
        reason: "course_invite",
        resource: "Data Structures in C",
      }),
    ).toContain("/fr/authenticate?");
  });

  it("rejects external continuation URLs", () => {
    expect(safeAccessPath("https://evil.example", "/en")).toBe("/en");
    expect(safeAccessPath("//evil.example", "/en")).toBe("/en");
  });
});
