import { describe, expect, it } from "vitest";

import {
  ZOE_RECOMMENDED_STORE_NO_PAYMENTS_PRESET_V1,
  ZOE_RECOMMENDED_STORE_PRESET_V1,
} from "./index";

describe("Zoe recommended provider presets", () => {
  it("uses ZoeStore for full-commerce checkout and Stripe only for payments", () => {
    const routes = new Map(
      ZOE_RECOMMENDED_STORE_PRESET_V1.routes.map(
        (route) => [
          route.capability,
          route.providerKey,
        ],
      ),
    );

    expect(routes.get("commerce.checkout")).toBe(
      "zoestore",
    );
    expect(routes.get("commerce.payments")).toBe(
      "stripe",
    );
  });

  it("gives nontechnical users subscriber and transactional-email defaults", () => {
    const routes = new Map(
      ZOE_RECOMMENDED_STORE_PRESET_V1.routes.map(
        (route) => [
          route.capability,
          route.providerKey,
        ],
      ),
    );

    expect(routes.get("engagement.contacts")).toBe(
      "zoe",
    );
    expect(routes.get("engagement.subscribers")).toBe(
      "zoe",
    );
    expect(
      routes.get("messaging.email.transactional"),
    ).toBe("brevo");
  });

  it("keeps payment optional while preserving all other recommended routes", () => {
    expect(
      ZOE_RECOMMENDED_STORE_NO_PAYMENTS_PRESET_V1.routes.some(
        (route) =>
          route.capability === "commerce.payments",
      ),
    ).toBe(false);

    expect(
      ZOE_RECOMMENDED_STORE_NO_PAYMENTS_PRESET_V1.routes.length,
    ).toBe(
      ZOE_RECOMMENDED_STORE_PRESET_V1.routes.length - 1,
    );
  });
});
