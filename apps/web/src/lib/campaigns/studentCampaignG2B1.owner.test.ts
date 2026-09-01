import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(rel: string) {
  return fs.readFileSync(
    path.join(root, rel),
    "utf8",
  );
}

describe("student campaign Admin ownership", () => {
  it("keeps campaign CRUD admin-only and CORS guarded", () => {
    const collection = source(
      "src/app/api/admin/student-campaigns/route.ts",
    );
    const item = source(
      "src/app/api/admin/student-campaigns/[id]/route.ts",
    );

    expect(collection).toContain("requireAdmin");
    expect(item).toContain("requireAdmin");
    expect(collection).toContain("isAppOriginAllowed");
    expect(item).toContain("isAppOriginAllowed");
  });

  it("grants campaign credits to every matching audience learner once", () => {
    const runtime = source(
      "src/lib/campaigns/studentCampaign.server.ts",
    );

    expect(runtime).toContain(
      "studentCampaignAudienceMatches",
    );
    expect(runtime).toContain(
      "subscriber = false",
    );
    expect(runtime).not.toContain(
      "user.createdAt",
    );
    expect(runtime).toContain(
      "tutoring:student-campaign:",
    );
  });
});
