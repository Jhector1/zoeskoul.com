import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isAuthenticatedStudentSession,
  isAuthenticatedWithoutStudentAccess,
} from "./authSession.js";

describe("student auth session probe", () => {
  it("requires both authentication and student access", () => {
    expect(
      isAuthenticatedStudentSession({
        authenticated: true,
        capabilities: [
          "student:access",
        ],
      }),
    ).toBe(true);

    expect(
      isAuthenticatedStudentSession({
        authenticated: false,
        capabilities: [
          "student:access",
        ],
      }),
    ).toBe(false);

    expect(
      isAuthenticatedStudentSession({
        authenticated: true,
        capabilities: [
          "teacher:access",
        ],
      }),
    ).toBe(false);
  });

  it("detects signed-in accounts without student access", () => {
    expect(
      isAuthenticatedWithoutStudentAccess({
        authenticated: true,
        capabilities: [
          "teacher:access",
        ],
      }),
    ).toBe(true);

    expect(
      isAuthenticatedWithoutStudentAccess({
        authenticated: false,
        capabilities: [],
      }),
    ).toBe(false);
  });
});
