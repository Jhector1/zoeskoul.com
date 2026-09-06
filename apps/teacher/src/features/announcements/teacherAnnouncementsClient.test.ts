import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTeacherAnnouncementsClient,
} from "./teacherAnnouncementsClient";

describe("Teacher announcements client", () => {
  it("uses school and class announcement endpoints", async () => {
    const fetchImpl =
      vi.fn<typeof globalThis.fetch>(
        async () =>
          Response.json({
            announcements: [],
          }),
      );

    const client =
      createTeacherAnnouncementsClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl,
      });

    await client.list(
      "school",
      "school-1",
    );
    await client.list(
      "class",
      "class-1",
    );

    expect(
      String(
        fetchImpl.mock.calls[0]?.[0],
      ),
    ).toContain(
      "/api/teacher/schools/school-1/announcements",
    );
    expect(
      String(
        fetchImpl.mock.calls[1]?.[0],
      ),
    ).toContain(
      "/api/teacher/learning-groups/class-1/announcements",
    );
  });
});
