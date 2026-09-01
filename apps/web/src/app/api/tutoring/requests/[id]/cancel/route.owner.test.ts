import {
  describe,
  expect,
  it,
} from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/tutoring/requests/[id]/cancel/route.ts",
  ),
  "utf8",
);

describe("learner tutoring cancellation route owner", () => {
  it("is learner authenticated, same-origin protected, and rate limited", () => {
    expect(source).toContain("getCurrentUserAccess");
    expect(source).toContain("accessStudentApp");
    expect(source).toContain("isAppMutationOriginAllowed");
    expect(source).toContain("rateLimit");
  });

  it("delegates to the canonical learner cancellation service", () => {
    expect(source).toContain("cancelLearnerTutoringRequest");
    expect(source).not.toContain("tutoringCreditLedgerEntry.create");
    expect(source).toContain("result.transitioned");
    expect(source).toContain(
      "notifyTutoringRequestCanceled",
    );
  });
});
