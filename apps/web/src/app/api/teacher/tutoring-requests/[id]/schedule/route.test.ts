import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAppMutationOriginAllowed: vi.fn(),
  exceedsContentLength: vi.fn(),
  readJsonSafe: vi.fn(),
  rateLimit: vi.fn(),
  getTeachingUser: vi.fn(),
  createTutoringBookingForRequest: vi.fn(),
  notifyTutoringScheduled: vi.fn(),
}));

vi.mock("@/lib/practice/api/shared/http", () => ({
  bodyJsonResponse: (body: unknown, status = 200) =>
    Response.json(body, { status }),
  exceedsContentLength: mocks.exceedsContentLength,
  readJsonSafe: mocks.readJsonSafe,
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
    createTutoringBookingForRequest:
      mocks.createTutoringBookingForRequest,
  };
});

vi.mock("@/lib/tutoring/tutoringLifecycleEmail", () => ({
  notifyTutoringScheduled: mocks.notifyTutoringScheduled,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request(
    "https://zoeskoul.test/api/teacher/tutoring-requests/request-1/schedule",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const CTX = {
  params: Promise.resolve({ id: "request-1" }),
};

describe("teacher tutoring request scheduling route", () => {
  beforeEach(() => {
    mocks.isAppMutationOriginAllowed.mockReset();
    mocks.exceedsContentLength.mockReset();
    mocks.readJsonSafe.mockReset();
    mocks.rateLimit.mockReset();
    mocks.getTeachingUser.mockReset();
    mocks.createTutoringBookingForRequest.mockReset();
    mocks.notifyTutoringScheduled.mockReset();

    mocks.isAppMutationOriginAllowed.mockReturnValue(true);
    mocks.exceedsContentLength.mockReturnValue(false);
    mocks.readJsonSafe.mockResolvedValue({
      startsAt: "2026-09-01T10:00:00-05:00",
    });
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.getTeachingUser.mockResolvedValue({
      id: "teacher-1",
      roles: ["teacher"],
      isAdmin: false,
    });
    mocks.notifyTutoringScheduled.mockResolvedValue(undefined);
    mocks.createTutoringBookingForRequest.mockResolvedValue({
      booking: {
        id: "booking-1",
        requestId: "request-1",
        teacherId: "teacher-1",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        durationMinutes: 30,
        status: "scheduled",
      },
      teacherId: "teacher-1",
      balance: {
        availableMinutes: 30,
        reservedMinutes: 30,
        totalMinutes: 60,
      },
    });
  });

  it("schedules the authenticated teacher rather than accepting a tutor id from the client", async () => {
    const response = await POST(
      request({
        startsAt: "2026-09-01T10:00:00-05:00",
      }),
      CTX,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createTutoringBookingForRequest,
    ).toHaveBeenCalledWith({
      requestId: "request-1",
      startsAt: new Date("2026-09-01T15:00:00.000Z"),
      confirmedTeacherId: "teacher-1",
    });
  });

  it("rejects a failed same-origin check before authentication or booking", async () => {
    mocks.isAppMutationOriginAllowed.mockReturnValue(false);

    const response = await POST(
      request({
        startsAt: "2026-09-01T10:00:00-05:00",
      }),
      CTX,
    );

    expect(response.status).toBe(403);
    expect(mocks.getTeachingUser).not.toHaveBeenCalled();
    expect(
      mocks.createTutoringBookingForRequest,
    ).not.toHaveBeenCalled();
  });

  it("requires a teaching user", async () => {
    mocks.getTeachingUser.mockResolvedValue(null);

    const response = await POST(
      request({
        startsAt: "2026-09-01T10:00:00-05:00",
      }),
      CTX,
    );

    expect(response.status).toBe(403);
    expect(
      mocks.createTutoringBookingForRequest,
    ).not.toHaveBeenCalled();
  });

  it("rejects client attempts to select a different teacher", async () => {
    mocks.readJsonSafe.mockResolvedValue({
      startsAt: "2026-09-01T10:00:00-05:00",
      teacherId: "teacher-2",
    });

    const response = await POST(
      request({
        startsAt: "2026-09-01T10:00:00-05:00",
        teacherId: "teacher-2",
      }),
      CTX,
    );

    expect(response.status).toBe(400);
    expect(
      mocks.createTutoringBookingForRequest,
    ).not.toHaveBeenCalled();
  });
});
