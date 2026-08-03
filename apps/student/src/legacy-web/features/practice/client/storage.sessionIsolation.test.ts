import { describe, expect, it } from "vitest";

import {
  buildSavedStateLookupKeys,
  getEffectiveSid,
  isSavedRunCompatible,
  resolveHydrationSessionId,
} from "./storage";

describe("practice session isolation", () => {
  it("prefers an authoritative Daily Practice session over URL and remembered module sessions", () => {
    expect(
      resolveHydrationSessionId({
        authoritativeSessionId: true,
        initialSessionId: "daily-session",
        sessionIdParam: "assignment-session",
        rememberedSessionId: "old-module-session",
      }),
    ).toBe("daily-session");
  });


  it("never lets an assignment URL override an authoritative Daily Practice session", () => {
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          search: "?sessionId=assignment-session&type=assignment",
        },
      },
    });

    try {
      expect(
        getEffectiveSid({
          sessionId: "daily-session",
          initialSessionId: "daily-session",
          authoritativeSessionId: true,
          resolvedSessionIdRef: { current: "daily-session" },
        }),
      ).toBe("daily-session");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("still honors the URL session for non-authoritative module practice", () => {
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { search: "?sessionId=assignment-session" } },
    });

    try {
      expect(
        getEffectiveSid({
          sessionId: "remembered-session",
          resolvedSessionIdRef: { current: "remembered-session" },
        }),
      ).toBe("assignment-session");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("uses URL, then component, then remembered session for non-authoritative surfaces", () => {
    expect(
      resolveHydrationSessionId({
        initialSessionId: "component-session",
        sessionIdParam: "url-session",
        rememberedSessionId: "remembered-session",
      }),
    ).toBe("url-session");

    expect(
      resolveHydrationSessionId({
        initialSessionId: "component-session",
        rememberedSessionId: "remembered-session",
      }),
    ).toBe("component-session");
  });

  it("never falls back from a session-scoped state lookup to a module-wide draft", () => {
    expect(
      buildSavedStateLookupKeys({
        subjectSlug: "applied-python-projects",
        moduleSlug: "python-8-object-oriented-foundations",
        section: null,
        topic: "all",
        difficulty: "all",
        n: 3,
        sessionId: "daily-session",
      }),
    ).toEqual([expect.stringContaining(":session:daily-session")]);
  });

  it("rejects an explicitly incompatible saved run", () => {
    expect(
      isSavedRunCompatible({
        expectedExperienceMode: "daily_five",
        savedRunMode: "assignment",
      }),
    ).toBe(false);

    expect(
      isSavedRunCompatible({
        expectedExperienceMode: "daily_five",
        savedRunMode: "daily_five",
      }),
    ).toBe(true);
  });
});
