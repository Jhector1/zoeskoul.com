import { describe, expect, it } from "vitest";

import {
  COMMERCE_CAPABILITIES,
  ENGAGEMENT_CAPABILITIES,
  MESSAGING_CAPABILITIES,
} from "./index";

describe("provider domain contracts", () => {
  it("keeps full-commerce checkout separate from payments", () => {
    expect(COMMERCE_CAPABILITIES).toContain(
      "commerce.checkout",
    );
    expect(COMMERCE_CAPABILITIES).toContain(
      "commerce.payments",
    );
    expect("commerce.checkout").not.toBe(
      "commerce.payments",
    );
  });

  it("keeps consent canonical rather than provider-routed", () => {
    expect(
      ENGAGEMENT_CAPABILITIES.includes(
        "engagement.consent" as never,
      ),
    ).toBe(false);
  });

  it("namespaces messaging independently from subscriber ownership", () => {
    expect(ENGAGEMENT_CAPABILITIES).toContain(
      "engagement.subscribers",
    );
    expect(MESSAGING_CAPABILITIES).toContain(
      "messaging.email.transactional",
    );
  });
});
