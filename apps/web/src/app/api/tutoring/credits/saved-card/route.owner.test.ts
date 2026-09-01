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
      "src/app/api/tutoring/credits/saved-card/route.ts",
    ),
    "utf8",
  );

describe(
  "saved-card tutoring payment route owner",
  () => {
    it(
      "requires authentication, same-origin mutation, rate limiting, and explicit consent",
      () => {
        expect(source)
          .toContain(
            "getCurrentUserAccess",
          );
        expect(source)
          .toContain(
            "isAppMutationOriginAllowed",
          );
        expect(source)
          .toContain(
            "confirmReuse !== true",
          );
        expect(source)
          .toContain(
            "rateLimit",
          );
      },
    );

    it(
      "accepts only minutes and an idempotent attempt id, never an amount or payment method id",
      () => {
        expect(source)
          .toContain(
            "isCheckoutAttemptId",
          );
        expect(source)
          .toContain(
            "isValidTutoringMinutes",
          );
        expect(source)
          .not.toContain(
            "paymentMethodId?:",
          );
        expect(source)
          .not.toContain(
            "amountMinor?:",
          );
      },
    );
  },
);
