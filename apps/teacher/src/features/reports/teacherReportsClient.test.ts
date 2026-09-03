import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTeacherReportsClient,
} from "./teacherReportsClient";

describe("Teacher Reports browser client", () => {
  it("loads a school report through the existing Teacher Web API boundary", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        report: {
          school: {
            id: "school-1",
            name: "Zoe Academy",
          },
          summary: {
            classes: 0,
            students: 0,
            assignments: 0,
            averageProgressPct: 0,
            averageAccuracyPct: 0,
          },
          classes: [],
          students: [],
        },
      }),
    );

    const client = createTeacherReportsClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    });

    await client.getSchoolReport("school-1");

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "/api/teacher/schools/school-1/report",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
    );
  });
});
