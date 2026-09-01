import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAppMutationOriginAllowed: vi.fn(),
  rateLimit: vi.fn(),
  getTeachingUser: vi.fn(),
  materialize: vi.fn(),
}));

vi.mock("@/lib/practice/api/shared/http", () => ({
  bodyJsonResponse: (body: unknown, status = 200) =>
    Response.json(body, { status }),
}));

vi.mock("@/lib/http/appCors", () => ({
  appCorsJson: (
    _request: Request,
    body: unknown,
    options: { status?: number } = {},
  ) => Response.json(body, { status: options.status ?? 200 }),
  appCorsPreflight: () => new Response(null, { status: 204 }),
  isAppMutationOriginAllowed:
    mocks.isAppMutationOriginAllowed,
}));

vi.mock("@/lib/security/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/teaching/teachingAccess", () => ({
  getTeachingUser: mocks.getTeachingUser,
}));

vi.mock("@/lib/tutoring/tutoringCommercialSession", async () => {
  const actual =
    await vi.importActual<
      typeof import("@/lib/tutoring/tutoringCommercialSession")
    >("@/lib/tutoring/tutoringCommercialSession");

  return {
    ...actual,
    materializeTutoringSessionForRequest: mocks.materialize,
  };
});

import { POST } from "./route";

const CTX = {
  params: Promise.resolve({ id: "request-1" }),
};

function request() {
  return new Request(
    "https://zoeskoul.test/api/teacher/tutoring-requests/request-1/prepare",
    { method: "POST" },
  );
}

describe("teacher tutoring prepare route", () => {
  beforeEach(() => {
    mocks.isAppMutationOriginAllowed.mockReset();
    mocks.rateLimit.mockReset();
    mocks.getTeachingUser.mockReset();
    mocks.materialize.mockReset();

    mocks.isAppMutationOriginAllowed.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.getTeachingUser.mockResolvedValue({
      id: "teacher-1",
      roles: ["teacher"],
      isAdmin: false,
    });
    mocks.materialize.mockResolvedValue({
      session: {
        id: "session-1",
        slug: "paid-tutoring-booking-1",
        title: "Tutoring — Python",
        status: "draft",
      },
      resumed: false,
    });
  });

  it("creates the paid tutoring draft for the authenticated assigned teacher", async () => {
    const response = await POST(request(), CTX);

    expect(response.status).toBe(201);
    expect(mocks.materialize).toHaveBeenCalledWith({
      requestId: "request-1",
      teachingUser: {
        id: "teacher-1",
        roles: ["teacher"],
        isAdmin: false,
      },
    });
  });

  it("returns 200 when retrying an already materialized request", async () => {
    mocks.materialize.mockResolvedValue({
      session: {
        id: "session-1",
        slug: "paid-tutoring-booking-1",
        title: "Tutoring — Python",
        status: "draft",
      },
      resumed: true,
    });

    const response = await POST(request(), CTX);
    expect(response.status).toBe(200);
  });

  it("rejects failed same-origin checks before authentication", async () => {
    mocks.isAppMutationOriginAllowed.mockReturnValue(false);

    const response = await POST(request(), CTX);

    expect(response.status).toBe(403);
    expect(mocks.getTeachingUser).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
  });
});
