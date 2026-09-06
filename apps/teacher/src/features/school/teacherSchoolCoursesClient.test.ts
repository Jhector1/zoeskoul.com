import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTeacherSchoolCoursesClient,
} from "./teacherSchoolCoursesClient";

describe("Teacher School courses client", () => {
  it("uses the School course-access API for list, enable, and disable", async () => {
    const fetchImpl =
      vi.fn<
        typeof globalThis.fetch
      >(
        async () =>
          Response.json({
            courses: [],
            canManage: true,
            ok: true,
          }),
      );

    const client =
      createTeacherSchoolCoursesClient(
        {
          apiOrigin:
            "https://zoeskoul.com",
          fetchImpl,
        },
      );

    await client.list(
      "school-1",
      "fr",
    );
    await client.enable(
      "school-1",
      "subject-1",
    );
    await client.disable(
      "school-1",
      "subject-1",
    );

    expect(
      String(
        fetchImpl.mock.calls[0]?.[0],
      ),
    ).toContain(
      "/api/teacher/schools/school-1/courses?locale=fr",
    );
    expect(
      fetchImpl.mock.calls[1]?.[1],
    ).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      fetchImpl.mock.calls[2]?.[1],
    ).toEqual(
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
