import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const host = readFileSync(
  new URL(
    "./StudentAnnouncementHost.tsx",
    import.meta.url,
  ),
  "utf8",
);
const client = readFileSync(
  new URL(
    "./studentAnnouncementsClient.ts",
    import.meta.url,
  ),
  "utf8",
);
const app = readFileSync(
  new URL(
    "../../App.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Student announcement ownership", () => {
  it("mounts the non-marketing host globally for authenticated students", () => {
    expect(app).toContain(
      "StudentAnnouncementHost",
    );
    expect(host).toContain(
      '"Learning.announcements"',
    );
    expect(host).not.toContain(
      "StudentCampaign",
    );
  });

  it("uses Web student announcement APIs", () => {
    expect(client).toContain(
      "/api/student/announcements",
    );

    for (const forbidden of [
      "server-only",
      "prisma",
      "@/lib/marketing",
    ]) {
      expect(
        host + client,
      ).not.toContain(forbidden);
    }
  });
});
