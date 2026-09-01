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
      "src/app/api/tutoring/payment-method/route.ts",
    ),
    "utf8",
  );

describe(
  "tutoring saved payment method route owner",
  () => {
    it(
      "requires authenticated ownership and explicit reuse consent",
      () => {
        expect(
          source,
        ).toContain(
          "getCurrentUserAccess",
        );
        expect(
          source,
        ).toContain(
          "confirmReuse !== true",
        );
        expect(
          source,
        ).toContain(
          "isAppMutationOriginAllowed",
        );
      },
    );

    it(
      "routes discovery and consent through the canonical saved-payment service",
      () => {
        expect(
          source,
        ).toContain(
          "getTutoringSavedPaymentMethod",
        );
        expect(
          source,
        ).toContain(
          "authorizeTutoringSavedPaymentMethodReuse",
        );
      },
    );
  },
);
