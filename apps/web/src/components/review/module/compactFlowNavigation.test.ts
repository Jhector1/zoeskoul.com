import { describe, expect, it } from "vitest";

import { isAtFinalModuleNavigationStep } from "./compactFlowNavigation";

describe("isAtFinalModuleNavigationStep", () => {
  it("keeps module navigation hidden while a nested project or quiz step remains", () => {
    expect(
      isAtFinalModuleNavigationStep({
        hasNextNestedStep: true,
        hasNextCard: false,
        hasNextTopic: false,
      }),
    ).toBe(false);
  });

  it("keeps module navigation hidden while another card or topic remains", () => {
    expect(
      isAtFinalModuleNavigationStep({
        hasNextNestedStep: false,
        hasNextCard: true,
        hasNextTopic: false,
      }),
    ).toBe(false);

    expect(
      isAtFinalModuleNavigationStep({
        hasNextNestedStep: false,
        hasNextCard: false,
        hasNextTopic: true,
      }),
    ).toBe(false);
  });

  it("allows next-module or unlock-next only on the final module step", () => {
    expect(
      isAtFinalModuleNavigationStep({
        hasNextNestedStep: false,
        hasNextCard: false,
        hasNextTopic: false,
      }),
    ).toBe(true);
  });
});
