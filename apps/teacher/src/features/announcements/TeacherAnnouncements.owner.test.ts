import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const panel = readFileSync(
  new URL(
    "./TeacherAnnouncementsPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const client = readFileSync(
  new URL(
    "./teacherAnnouncementsClient.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher announcement ownership", () => {
  it("stays browser-only in Teacher", () => {
    expect(panel).toContain(
      '"Teacher.announcements"',
    );

    for (const forbidden of [
      "next/",
      "server-only",
      "prisma",
      "StudentCampaign",
    ]) {
      expect(
        panel + client,
      ).not.toContain(forbidden);
    }
  });

  it("uses Web teacher announcement APIs", () => {
    expect(client).toContain(
      "/api/teacher/schools/",
    );
    expect(client).toContain(
      "/api/teacher/learning-groups/",
    );
  });
});
