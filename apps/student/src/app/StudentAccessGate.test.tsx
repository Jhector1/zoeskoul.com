import React from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}));

vi.mock("@zoeskoul/auth-client/react", () => ({
  useAppSession: mocks.useAppSession,
}));

import {
  StudentAccessGate,
} from "./StudentAccessGate";

describe("StudentAccessGate", () => {
  it("recognizes the shared student capability", () => {
    const capabilities = [
      "student:access",
    ];
    const child = vi.fn(
      () => <div>student ready</div>,
    );

    mocks.useAppSession.mockReturnValue({
      status: "authenticated",
      session: {
        authenticated: true,
        user: {
          id: "student-1",
          name: "Student",
          email: "student@example.com",
          image: null,
        },
        roles: ["student"],
        capabilities,
      },
      error: null,
    });

    const markup = renderToStaticMarkup(
      <StudentAccessGate
        apiOrigin="https://zoeskoul.com"
        websiteOrigin="https://zoeskoul.com"
      >
        {child}
      </StudentAccessGate>,
    );

    expect(child).toHaveBeenCalledTimes(1);
    expect(markup).toContain("student ready");
    expect(Array.isArray(capabilities)).toBe(
      true,
    );
    expect(Object.keys(capabilities)).toEqual([
      "0",
    ]);
  });

  it("allows an anonymous session through only for a public route", () => {
    const session = {
      authenticated: false,
      user: null,
      roles: [],
      capabilities: [],
    } as const;
    const child = vi.fn(
      () => <div>public catalog</div>,
    );

    mocks.useAppSession.mockReturnValue({
      status: "unauthenticated",
      session,
      error: null,
    });

    const markup = renderToStaticMarkup(
      <StudentAccessGate
        apiOrigin="https://zoeskoul.com"
        websiteOrigin="https://zoeskoul.com"
        allowUnauthenticated
      >
        {child}
      </StudentAccessGate>,
    );

    expect(child).toHaveBeenCalledWith(session);
    expect(markup).toContain("public catalog");
  });

  it("keeps anonymous protected routes behind sign in", () => {
    const child = vi.fn(
      () => <div>never rendered</div>,
    );

    mocks.useAppSession.mockReturnValue({
      status: "unauthenticated",
      session: {
        authenticated: false,
        user: null,
        roles: [],
        capabilities: [],
      },
      error: null,
    });

    const markup = renderToStaticMarkup(
      <StudentAccessGate
        apiOrigin="https://zoeskoul.com"
        websiteOrigin="https://zoeskoul.com"
      >
        {child}
      </StudentAccessGate>,
    );

    expect(child).not.toHaveBeenCalled();
    expect(markup).toContain("Sign-in required");
  });

  it("allows authenticated non-student accounts to browse public routes", () => {
    const child = vi.fn(
      () => <div>teacher catalog</div>,
    );

    mocks.useAppSession.mockReturnValue({
      status: "authenticated",
      session: {
        authenticated: true,
        user: {
          id: "teacher-1",
          name: "Teacher",
          email: "teacher@example.com",
          image: null,
        },
        roles: ["teacher"],
        capabilities: ["teacher:access"],
      },
      error: null,
    });

    const markup = renderToStaticMarkup(
      <StudentAccessGate
        apiOrigin="https://zoeskoul.com"
        websiteOrigin="https://zoeskoul.com"
        allowUnauthenticated
      >
        {child}
      </StudentAccessGate>,
    );

    expect(child).toHaveBeenCalledTimes(1);
    expect(markup).toContain("teacher catalog");
  });

  it("denies a session missing student capability with unchanged copy", () => {
    mocks.useAppSession.mockReturnValue({
      status: "authenticated",
      session: {
        authenticated: true,
        user: {
          id: "teacher-1",
          name: "Teacher",
          email: "teacher@example.com",
          image: null,
        },
        roles: ["teacher"],
        capabilities: ["teacher:access"],
      },
      error: null,
    });

    const markup = renderToStaticMarkup(
      <StudentAccessGate
        apiOrigin="https://zoeskoul.com"
        websiteOrigin="https://zoeskoul.com"
      >
        {() => <div>never rendered</div>}
      </StudentAccessGate>,
    );

    expect(markup).toContain(
      "This account cannot open the student application",
    );
    expect(markup).toContain(
      "Access is controlled by the roles stored for your account in the ZoeSkoul database.",
    );
    expect(markup).toContain(
      '<main class="student-state-page"><section class="student-state-card">',
    );
    expect(markup).toContain(
      '<p class="student-state-eyebrow">Access unavailable</p>',
    );
    expect(markup).toContain(
      '<a class="student-primary-button" href="https://zoeskoul.com">Return to ZoeSkoul</a>',
    );
  });
});
