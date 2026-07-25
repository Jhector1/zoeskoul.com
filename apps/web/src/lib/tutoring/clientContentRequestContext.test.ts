import { describe, expect, it } from "vitest";
import {
  getTutoringClientContentRequestContext,
  withTutoringContentRequestHeaders,
} from "./clientContentRequestContext";
import { TUTORING_SESSION_HEADER } from "./contentRequestProtocol";

describe("tutoring client content request context", () => {
  it("reads the opaque session id from a tutoring lesson route", () => {
    expect(
      getTutoringClientContentRequestContext({
        pathname:
          "/en/tutoring-sessions/session%201/subjects/python/modules/private-course/learn",
      } as Location),
    ).toEqual({
      sessionId: "session 1",
      dedupeKey: "tutoring:session 1",
    });
  });

  it("does not add tutoring authorization outside tutoring routes", () => {
    const headers = withTutoringContentRequestHeaders(
      { "Content-Type": "application/json" },
      null,
    );

    expect(headers.get(TUTORING_SESSION_HEADER)).toBeNull();
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("adds tutoring authorization without replacing existing headers", () => {
    const headers = withTutoringContentRequestHeaders(
      { "Content-Type": "application/json" },
      { sessionId: "session-1", dedupeKey: "tutoring:session-1" },
    );

    expect(headers.get(TUTORING_SESSION_HEADER)).toBe("session-1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
