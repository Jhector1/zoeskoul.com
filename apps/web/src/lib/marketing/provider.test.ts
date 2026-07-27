import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let getConfiguredMarketingProvider: typeof import("./provider").getConfiguredMarketingProvider;
let parseMarketingProviderName: typeof import("./provider").parseMarketingProviderName;

beforeAll(async () => {
  ({ getConfiguredMarketingProvider, parseMarketingProviderName } = await import(
    "./provider"
  ));
});

describe("marketing provider selection", () => {
  it("selects Brevo explicitly", () => {
    expect(
      getConfiguredMarketingProvider({ MARKETING_EMAIL_PROVIDER: "brevo" })
        ?.name,
    ).toBe("brevo");
  });

  it("keeps Beehiiv available for a later switch", () => {
    expect(
      getConfiguredMarketingProvider({ MARKETING_EMAIL_PROVIDER: "BEEHIIV" })
        ?.name,
    ).toBe("beehiiv");
  });

  it("does not guess a provider when the switch is missing or invalid", () => {
    expect(getConfiguredMarketingProvider({})).toBeNull();
    expect(parseMarketingProviderName("mailchimp")).toBeNull();
  });
});
