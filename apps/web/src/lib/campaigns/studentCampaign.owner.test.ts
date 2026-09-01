import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("student campaign foundation ownership", () => {
  it("reuses the canonical tutoring ledger grant owner", () => {
    const campaign = source(
      "src/lib/campaigns/studentCampaign.server.ts",
    );

    expect(campaign).toContain("grantTutoringMinutes");
    expect(campaign).toContain('kind: "admin_grant"');
    expect(campaign).toContain("promotional: true");
    expect(campaign).toContain("refundable: false");
    expect(campaign).toContain("tutoring:student-campaign:");
  });

  it("keeps the campaign separate from a parallel credit balance", () => {
    const schema = source("../../packages/db/prisma/schema.prisma");
    expect(schema).toContain("model StudentCampaign");
    expect(schema).toContain("model StudentCampaignDelivery");
    expect(schema).not.toContain("StudentCampaignCredit");
  });

  it("hooks Auth.js new-user creation to the campaign grant owner", () => {
    const auth = source("src/lib/auth.ts");
    expect(auth).toContain("ensureStudentCampaignTutoringGrants");
    expect(auth).toContain("[auth][student-campaign-grant]");
  });
});
