import { describe, expect, it } from "vitest";
import {
  buildTutoringPath,
  buildTutoringSignInHref,
} from "./tutoringSignInHref";

describe("tutoring sign-in href", () => {
  it("builds the student tutoring list path", () => {
    expect(buildTutoringPath({ locale: "en" })).toBe(
      "/en/tutoring-sessions",
    );
  });

  it("preserves the exact classroom deep link through ZoeSkoul authentication", () => {
    const href = buildTutoringSignInHref({
      locale: "en",
      segments: [
        "session 1",
        "subjects",
        "python",
        "modules",
        "module-1",
        "learn",
        "section-1",
        "topic-1",
        "exercise",
        "strings/concat",
      ],
    });
    const url = new URL(href, "https://zoeskoul.test");

    expect(url.pathname).toBe("/en/authenticate");
    expect(url.searchParams.get("reason")).toBe("tutoring_session");
    expect(url.searchParams.get("callbackUrl")).toBe(
      "/en/tutoring-sessions/session%201/subjects/python/modules/module-1/learn/section-1/topic-1/exercise/strings%2Fconcat",
    );
  });
});
