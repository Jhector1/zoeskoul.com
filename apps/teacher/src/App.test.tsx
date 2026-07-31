import React from "react";
import {
  readFileSync,
} from "node:fs";
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

import { App } from "./App";

describe("Teacher app session contract", () => {
  it("recognizes the shared teacher capability", () => {
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

    const markup = renderToStaticMarkup(
      <App />,
    );

    expect(markup).toContain(
      "Authenticated teaching application session ready",
    );
    expect(markup).toContain(
      "teacher",
    );
    const capabilities =
      mocks.useAppSession.mock.results[0]
        .value.session.capabilities;
    expect(Array.isArray(capabilities)).toBe(
      true,
    );
    expect(Object.keys(capabilities)).toEqual([
      "0",
      "1",
    ]);
  });

  it("denies a student-only session", () => {
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

    const markup = renderToStaticMarkup(
      <App />,
    );

    expect(markup).toContain(
      "Signed in, but this account cannot access the teacher app",
    );
  });

  it("does not define a raw role union in the active Teacher entrypoint", () => {
    const source = readFileSync(
      new URL("./App.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain(
      "\"student\" | \"teacher\" | \"admin\"",
    );
  });
});
