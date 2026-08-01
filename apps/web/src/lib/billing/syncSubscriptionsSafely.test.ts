import { describe, expect, it, vi } from "vitest";

import { syncSubscriptionsSafely } from "./syncSubscriptionsSafely";

describe("syncSubscriptionsSafely", () => {
  it("returns true without logging when synchronization succeeds", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();

    await expect(
      syncSubscriptionsSafely({
        userId: "user_1",
        source: "billing/status",
        sync,
        logError,
      }),
    ).resolves.toBe(true);

    expect(sync).toHaveBeenCalledWith("user_1");
    expect(logError).not.toHaveBeenCalled();
  });

  it("logs failures and returns false instead of silently swallowing them", async () => {
    const error = new Error("Stripe API timeout");
    const sync = vi.fn().mockRejectedValue(error);
    const logError = vi.fn();

    await expect(
      syncSubscriptionsSafely({
        userId: "user_2",
        source: "billing/require-entitled",
        sync,
        logError,
      }),
    ).resolves.toBe(false);

    expect(logError).toHaveBeenCalledWith(
      "[billing/require-entitled] Stripe subscription sync failed",
      { userId: "user_2", error },
    );
  });
});
