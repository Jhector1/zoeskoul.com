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

vi.mock(
  "@zoeskoul/auth-client/react",
  () => ({
    useAppSession:
      mocks.useAppSession,
  }),
);

vi.mock(
  "../compat/next-intl",
  () => ({
    useTranslations:
      () => (key: string) => key,
  }),
);

import {
  TeacherAccessGate,
} from "./TeacherAccessGate";

describe("TeacherAccessGate", () => {
  it("uses the canonical teacher capability", () => {
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
        capabilities: [
          "student:access",
          "teacher:access",
        ],
      },
      error: null,
    });

    const markup =
      renderToStaticMarkup(
        <TeacherAccessGate
          apiOrigin="https://zoeskoul.com"
          websiteOrigin="https://zoeskoul.com"
        >
          {() => (
            <div data-testid="ready">
              ready
            </div>
          )}
        </TeacherAccessGate>,
      );

    expect(markup).toContain(
      'data-testid="ready"',
    );
  });

  it("denies a session without teacher access", () => {
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
        capabilities: ["student:access"],
      },
      error: null,
    });

    expect(
      renderToStaticMarkup(
        <TeacherAccessGate
          apiOrigin="https://zoeskoul.com"
          websiteOrigin="https://zoeskoul.com"
        >
          {() => <div>ready</div>}
        </TeacherAccessGate>,
      ),
    ).toContain("accessTitle");
  });
});
