import { describe, expect, it, vi } from "vitest";

import {
  loadTeacherTutoringOverview,
  prepareTeacherTutoringRequest,
  scheduleTeacherTutoringRequest,
} from "./teacherTutoringClient";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Teacher commercial tutoring browser client", () => {
  it("loads queue and availability with credentialed Web API requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/teacher/tutoring-requests")) {
        return json({
          pool: { userId: "teacher-1", enabled: true, priority: 100 },
          requests: [],
        });
      }

      return json({
        availability: {
          userId: "teacher-1",
          enabled: true,
          priority: 100,
          timeZone: "America/Chicago",
          availabilityWindows: [],
        },
      });
    });

    const result = await loadTeacherTutoringOverview(
      "https://zoeskoul.com",
      fetchImpl,
    );

    expect(result.pool.enabled).toBe(true);
    expect(result.availability.timeZone).toBe("America/Chicago");
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]).toMatchObject({
        credentials: "include",
        cache: "no-store",
      });
    }
  });

  it("schedules only a start time and never submits teacher or duration", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json(
        {
          booking: {
            id: "booking-1",
            startsAt: "2026-09-01T15:00:00.000Z",
            durationMinutes: 30,
            status: "scheduled",
            tutoringSessionId: null,
          },
          teacherId: "teacher-1",
        },
        201,
      ),
    );

    await scheduleTeacherTutoringRequest(
      {
        apiOrigin: "https://zoeskoul.com",
        requestId: "request-1",
        startsAt: "2026-09-01T15:00:00.000Z",
      },
      fetchImpl,
    );

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ startsAt: "2026-09-01T15:00:00.000Z" });
    expect(body).not.toHaveProperty("teacherId");
    expect(body).not.toHaveProperty("durationMinutes");
  });

  it("prepares through the commercial materialization owner", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json(
        {
          session: {
            id: "session-1",
            slug: "paid-tutoring-booking-1",
            status: "draft",
          },
          resumed: false,
        },
        201,
      ),
    );

    const result = await prepareTeacherTutoringRequest(
      {
        apiOrigin: "https://zoeskoul.com",
        requestId: "request-1",
      },
      fetchImpl,
    );

    expect(result.session.id).toBe("session-1");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/api/teacher/tutoring-requests/request-1/prepare",
    );
  });
});
