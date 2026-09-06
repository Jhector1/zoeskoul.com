import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  loadUnreadStudentAnnouncements,
  markStudentAnnouncementRead,
} from "./studentAnnouncementsClient";

describe("Student announcements client", () => {
  it("uses the authenticated student announcement endpoints", async () => {
    const originalFetch =
      globalThis.fetch;
    const fetchMock =
      vi.fn<typeof globalThis.fetch>(
        async (input) => {
          const url = String(input);
          return Response.json(
            url.endsWith("/read")
              ? { ok: true }
              : {
                  announcements: [],
                },
          );
        },
      );
    globalThis.fetch = fetchMock;

    try {
      await loadUnreadStudentAnnouncements(
        "https://zoeskoul.com",
      );
      await markStudentAnnouncementRead(
        "https://zoeskoul.com",
        "announcement-1",
      );
    } finally {
      globalThis.fetch =
        originalFetch;
    }

    expect(
      String(
        fetchMock.mock.calls[0]?.[0],
      ),
    ).toContain(
      "/api/student/announcements",
    );
    expect(
      String(
        fetchMock.mock.calls[1]?.[0],
      ),
    ).toContain(
      "/api/student/announcements/announcement-1/read",
    );
  });
});
