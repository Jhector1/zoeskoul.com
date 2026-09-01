import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const source =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/tutoring/credits/refund/route.ts",
    ),
    "utf8",
  );

describe(
  "learner tutoring refund route owner",
  () => {
    it(
      "is learner authenticated, same-origin protected, and rate limited",
      () => {
        expect(source)
          .toContain(
            "getCurrentUserAccess",
          );
        expect(source)
          .toContain(
            "accessStudentApp",
          );
        expect(source)
          .toContain(
            "isAppMutationOriginAllowed",
          );
        expect(source)
          .toContain(
            "rateLimit",
          );
      },
    );

    it(
      "accepts purchase identity and minutes but no browser-authored amount",
      () => {
        expect(source)
          .toContain(
            "purchaseId",
          );
        expect(source)
          .toContain(
            "minutes",
          );
        expect(source)
          .not.toContain(
            "body.amountMinor",
          );
        expect(source)
          .toContain(
            "requestTutoringCreditRefund",
          );
      },
    );
  },
);
