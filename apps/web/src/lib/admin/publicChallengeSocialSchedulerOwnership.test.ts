import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const workflowPath = path.join(
  repoRoot,
  ".github/workflows/public-challenge-social-autopost.yml",
);

describe("public challenge social scheduler ownership", () => {
  it("keeps the protected recurring production trigger in the repository", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain(
      "/api/internal/public-challenges/social/tick",
    );
    expect(workflow).toContain(
      "secrets.ZOESKOUL_SOCIAL_SCHEDULER_SECRET",
    );
    expect(workflow).toContain(
      "if: ${{ env.SCHEDULER_SECRET == '' }}",
    );
    expect(workflow).toContain(
      "if: ${{ env.SCHEDULER_SECRET != '' }}",
    );
    expect(workflow).toContain(
      "social autopost tick skipped",
    );
    expect(workflow).toContain("--request POST");
    expect(workflow).toContain(
      'Authorization: Bearer ${SCHEDULER_SECRET}',
    );
    expect(workflow).toContain("--retry 3");
  });

  it("does not hard-code the scheduler bearer secret", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).not.toMatch(
      /Authorization:\s*Bearer\s+[A-Za-z0-9_-]{16,}/,
    );
  });
});
