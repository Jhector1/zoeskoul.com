import { describe, expect, it } from "vitest";
import { resolveTeachingPageRedirect } from "./teachingPageAccess";

describe("resolveTeachingPageRedirect", () => {
  it("keeps teachers and admins on the teaching page", () => {
    expect(resolveTeachingPageRedirect({ authenticated: true, allowed: true, locale: "en" })).toBeNull();
  });

  it("redirects an authenticated learner to assigned courses", () => {
    expect(resolveTeachingPageRedirect({ authenticated: true, allowed: false, locale: "en" })).toBe(
      "/en/assignments",
    );
  });

  it("sends signed-out visitors to sign in with the localized teaching page as callback", () => {
    expect(
      resolveTeachingPageRedirect({
        authenticated: false,
        allowed: false,
        locale: "fr",
        callbackPath: "/admin/learning-groups",
      }),
    ).toBe(
      "/api/auth/signin?callbackUrl=%2Ffr%2Fadmin%2Flearning-groups",
    );
  });
});
