import { describe, expect, it } from "vitest";
import {
  getTutoringClientContentRequestContext,
  withTutoringContentRequestHeaders,
} from "@zoeskoul/learning-client/legacy-compatible/tutoring/clientContentRequestContext";
import {
  TUTORING_LEARNER_ID_HEADER,
  TUTORING_SESSION_HEADER,
  TUTORING_WORKSPACE_VIEW_HEADER,
} from "@zoeskoul/learning-contracts/tutoring/contentRequestProtocol";

describe("tutoring client content request context", () => {
  it("reads session and selected learner workspace from a tutoring lesson route", () => {
    expect(
      getTutoringClientContentRequestContext({
        pathname:
          "/en/tutoring-sessions/session%201/subjects/python/modules/private-course/learn",
        search: "?workspace=learner&learnerId=student-7",
      } as Location),
    ).toEqual({
      sessionId: "session 1",
      workspaceView: "learner",
      learnerId: "student-7",
      dedupeKey: "tutoring:session 1:learner:student-7",
    });
  });

  it("defaults a tutoring route to the user's private workspace", () => {
    expect(
      getTutoringClientContentRequestContext({
        pathname: "/en/tutoring-sessions/session-1/subjects/python/modules/m/learn",
        search: "",
      } as Location),
    ).toMatchObject({
      sessionId: "session-1",
      workspaceView: "mine",
      learnerId: null,
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

  it("adds workspace authorization without replacing existing headers", () => {
    const headers = withTutoringContentRequestHeaders(
      { "Content-Type": "application/json" },
      {
        sessionId: "session-1",
        workspaceView: "learner",
        learnerId: "student-7",
        dedupeKey: "tutoring:session-1:learner:student-7",
      },
    );

    expect(headers.get(TUTORING_SESSION_HEADER)).toBe("session-1");
    expect(headers.get(TUTORING_WORKSPACE_VIEW_HEADER)).toBe("learner");
    expect(headers.get(TUTORING_LEARNER_ID_HEADER)).toBe("student-7");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
