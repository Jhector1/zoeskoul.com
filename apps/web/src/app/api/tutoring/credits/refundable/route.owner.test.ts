import {
  describe,
  expect,
  it,
} from "vitest";
import fs from "node:fs";
import path from "node:path";

const source =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/tutoring/credits/refundable/route.ts",
    ),
    "utf8",
  );

describe(
  "refundable tutoring credit route owner",
  () => {
    it(
      "is read-only, learner authenticated, and origin protected",
      () => {
        expect(source)
          .toContain(
            "export async function GET",
          );
        expect(source)
          .toContain(
            "isAppOriginAllowed",
          );
        expect(source)
          .toContain(
            "accessStudentApp",
          );
        expect(source)
          .not.toContain(
            "export async function POST",
          );
      },
    );

    it(
      "delegates all refundability accounting to the provenance owner",
      () => {
        expect(source)
          .toContain(
            "getTutoringCreditRefundProvenance",
          );
        expect(source)
          .not.toContain(
            "refunds.create",
          );
        expect(source)
          .not.toContain(
            "tutoringCreditLedgerEntry.create",
          );
      },
    );
  },
);
