import { describe, expect, it } from "vitest";

import { resolvePracticePurposeRequestParams } from "./practiceRequestPolicy";

describe("practice request purpose policy", () => {
  it("lets the server own purpose selection for an existing session", () => {
    expect(
      resolvePracticePurposeRequestParams({
        sessionId: "trial-session",
        preferPurpose: "project",
        purposePolicy: "strict",
      }),
    ).toEqual({});
  });

  it("keeps authored purpose controls for a new non-session practice run", () => {
    expect(
      resolvePracticePurposeRequestParams({
        sessionId: null,
        preferPurpose: "project",
        purposePolicy: "strict",
      }),
    ).toEqual({
      preferPurpose: "project",
      purposePolicy: "strict",
    });
  });

  it("does not emit empty purpose query parameters", () => {
    expect(
      resolvePracticePurposeRequestParams({
        sessionId: null,
      }),
    ).toEqual({});
  });
});
