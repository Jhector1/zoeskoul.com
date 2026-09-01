import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relativePath: string,
) {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "tutoring embedded Checkout ownership",
  () => {
    it("reuses the canonical tutoring checkout owner with an embedded mode", () => {
      const checkout =
        source(
          "src/lib/tutoring/tutoringCreditCheckout.ts",
        );

      expect(
        checkout,
      ).toContain(
        '"embedded"',
      );
      expect(
        checkout,
      ).toContain(
        "ui_mode:",
      );
      expect(
        checkout,
      ).toContain(
        '"embedded" as const',
      );
      expect(
        checkout,
      ).toContain(
        "redirect_on_completion:",
      );
      expect(
        checkout,
      ).toContain(
        '"never" as const',
      );
      expect(
        checkout,
      ).toContain(
        "client_secret",
      );
      expect(
        checkout,
      ).toContain(
        "publishableKey",
      );
    });

    it("keeps hosted Checkout as the default purchase mode", () => {
      const checkout =
        source(
          "src/lib/tutoring/tutoringCreditCheckout.ts",
        );

      expect(
        checkout,
      ).toContain(
        "const uiMode =",
      );
      expect(
        checkout,
      ).toMatch(
        /args\.uiMode\s*\?\?\s*"hosted"/,
      );
      expect(
        checkout,
      ).toContain(
        "success_url:",
      );
      expect(
        checkout,
      ).toContain(
        "successUrl",
      );
      expect(
        checkout,
      ).toContain(
        "cancel_url:",
      );
      expect(
        checkout,
      ).toContain(
        "cancelUrl",
      );
    });

    it("never grants tutoring credit from the browser", () => {
      const webhook =
        source(
          "src/lib/tutoring/tutoringCreditWebhook.ts",
        );
      const client =
        source(
          "../student/src/features/tutoring/humanTutoringClient.ts",
        );

      expect(
        webhook,
      ).toContain(
        "settlePaidTutoringCreditPurchase",
      );
      expect(
        client,
      ).not.toContain(
        "purchase_grant",
      );
      expect(
        client,
      ).not.toContain(
        "availableMinutesDelta",
      );
    });
  },
);
