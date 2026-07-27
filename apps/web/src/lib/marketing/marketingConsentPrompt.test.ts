import { describe, expect, it } from "vitest";
import { shouldShowMarketingConsentPrompt } from "./marketingConsentPrompt";

describe("marketing consent prompt policy", () => {
  it("shows after authentication when no preference exists", () => {
    expect(
      shouldShowMarketingConsentPrompt({
        sessionStatus: "authenticated",
        pathname: "/en",
        hasPreference: false,
      }),
    ).toBe(true);
  });

  it("does not show on the authentication page", () => {
    expect(
      shouldShowMarketingConsentPrompt({
        sessionStatus: "authenticated",
        pathname: "/en/authenticate",
        hasPreference: false,
      }),
    ).toBe(false);
  });

  it("does not show after either choice has been stored", () => {
    expect(
      shouldShowMarketingConsentPrompt({
        sessionStatus: "authenticated",
        pathname: "/en",
        hasPreference: true,
      }),
    ).toBe(false);
  });
});
