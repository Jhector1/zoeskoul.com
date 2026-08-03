import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isAppSessionResponse,
} from "./index";

describe("isAppSessionResponse", () => {
  it("accepts an authenticated browser-safe payload", () => {
    const payload = {
      authenticated: true,
      user: {
        id: "user-1",
        name: "Zoe",
        email: "zoe@example.com",
        image: null,
      },
      roles: ["teacher"],
      capabilities: [
        "student:access",
        "teacher:access",
      ],
    };

    expect(
      isAppSessionResponse(payload),
    ).toBe(true);
    expect(
      Array.isArray(payload.capabilities),
    ).toBe(true);
    expect(
      Object.keys(payload.capabilities),
    ).toEqual(["0", "1"]);
  });

  it("accepts an unauthenticated payload", () => {
    expect(
      isAppSessionResponse({
        authenticated: false,
        user: null,
        roles: [],
        capabilities: [],
      }),
    ).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: "user-1",
          name: null,
          email: null,
          image: null,
        },
        roles: ["super-admin"],
        capabilities: ["student:access"],
      }),
    ).toBe(false);
  });

  it("rejects unknown capabilities", () => {
    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: "user-1",
          name: null,
          email: null,
          image: null,
        },
        roles: ["student"],
        capabilities: ["billing:access"],
      }),
    ).toBe(false);
  });

  it("rejects server-only or token fields", () => {
    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: "user-1",
          name: "Zoe",
          email: "zoe@example.com",
          image: null,
          accessToken: "secret",
        },
        roles: ["student"],
        capabilities: ["student:access"],
      }),
    ).toBe(false);
  });

  it("rejects invalid payload shapes", () => {
    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: 42,
          name: "Zoe",
          email: "zoe@example.com",
          image: null,
        },
        roles: ["student"],
        capabilities: ["student:access"],
      }),
    ).toBe(false);
  });

  it("rejects extra top-level fields", () => {
    expect(
      isAppSessionResponse({
        authenticated: false,
        user: null,
        roles: [],
        capabilities: [],
        expires: "tomorrow",
      }),
    ).toBe(false);
  });

  it("rejects extra browser user fields", () => {
    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: "user-1",
          name: "Zoe",
          email: "zoe@example.com",
          image: null,
          timezone: "UTC",
        },
        roles: ["student"],
        capabilities: ["student:access"],
      }),
    ).toBe(false);
  });

  it("rejects decorated capability arrays", () => {
    const capabilities = [
      "student:access",
    ];
    (
      capabilities as unknown as Record<
        string,
        unknown
      >
    ).canUnlockAll = false;

    expect(
      isAppSessionResponse({
        authenticated: true,
        user: {
          id: "user-1",
          name: "Zoe",
          email: "zoe@example.com",
          image: null,
        },
        roles: ["student"],
        capabilities,
      }),
    ).toBe(false);
  });
});
