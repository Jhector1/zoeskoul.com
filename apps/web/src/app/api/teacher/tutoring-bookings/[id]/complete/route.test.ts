import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAppMutationOriginAllowed: vi.fn(),
  rateLimit: vi.fn(),
  getTeachingUser: vi.fn(),
  consume: vi.fn(),
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

vi.mock("@/lib/tutoring/tutoringCommercial", async () => {
  const actual =
    await vi.importActual<
      typeof import("@/lib/tutoring/tutoringCommercial")
    >("@/lib/tutoring/tutoringCommercial");

  return {
    ...actual,
    consumeTutoringBookingCredits: mocks.consume,
  };
});

import { POST } from "./route";

const CTX = {
  params: Promise.resolve({ id: "booking-1" }),
};

function request() {
  return new Request(
    "https://zoeskoul.test/api/teacher/tutoring-bookings/booking-1/complete",
    { method: "POST" },
  );
}

describe("teacher tutoring booking completion route", () => {
  beforeEach(() => {
    mocks.isAppMutationOriginAllowed.mockReset();
    mocks.rateLimit.mockReset();
    mocks.getTeachingUser.mockReset();
    mocks.consume.mockReset();

    mocks.isAppMutationOriginAllowed.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.getTeachingUser.mockResolvedValue({
      id: "teacher-1",
      email: "teacher1@example.com",
      roles: ["teacher"],
      isAdmin: false,
    });
    mocks.consume.mockResolvedValue({
      availableMinutes: 30,
      reservedMinutes: 0,
      totalMinutes: 30,
    });
  });

  it("completes through the immutable consumption owner as the authenticated teacher", async () => {
    const response = await POST(request(), CTX);

    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith(
      "booking-1",
      { expectedTeacherId: "teacher-1" },
    );
  });

  it("rejects failed same-origin checks before lifecycle mutation", async () => {
    mocks.isAppMutationOriginAllowed.mockReturnValue(false);

    const response = await POST(request(), CTX);

    expect(response.status).toBe(403);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("requires an authenticated teaching user", async () => {
    mocks.getTeachingUser.mockResolvedValue(null);

    const response = await POST(request(), CTX);

    expect(response.status).toBe(403);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
