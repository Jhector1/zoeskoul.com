import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreatePlatformStripeCustomerId,
  isMissingPlatformStripeCustomerError,
  withValidPlatformStripeCustomer,
} from "./platformStripeCustomer";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(), setCustomerId: vi.fn(), retrieveCustomer: vi.fn(), createCustomer: vi.fn(),
}));
const deps = mocks;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue({ email: "member@example.test", stripeCustomerId: "cus_old" });
  mocks.retrieveCustomer.mockResolvedValue({ id: "cus_old", deleted: false });
  mocks.createCustomer.mockResolvedValue({ id: "cus_new" });
  mocks.setCustomerId.mockResolvedValue(undefined);
});

describe("shared platform Stripe customer lifecycle", () => {
  it("reuses a verified existing customer without new writes", async () => {
    expect(await getOrCreatePlatformStripeCustomerId({ userId: " member ", deps })).toBe("cus_old");
    expect(mocks.findUser).toHaveBeenCalledWith("member");
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.setCustomerId).not.toHaveBeenCalled();
  });
  it("creates a customer when there is no bound customer", async () => {
    mocks.findUser.mockResolvedValue({ email: "member@example.test", stripeCustomerId: null });
    expect(await getOrCreatePlatformStripeCustomerId({ userId: "member", deps })).toBe("cus_new");
    expect(mocks.createCustomer).toHaveBeenCalledWith("member", "member@example.test");
    expect(mocks.setCustomerId).toHaveBeenCalledWith("member", "cus_new");
  });
  it("replaces a deleted customer", async () => {
    mocks.retrieveCustomer.mockResolvedValue({ deleted: true });
    expect(await getOrCreatePlatformStripeCustomerId({ userId: "member", deps })).toBe("cus_new");
    expect(mocks.setCustomerId.mock.calls.map(c => c[1])).toEqual([null, "cus_new"]);
  });
  it("replaces a definitely missing Stripe customer", async () => {
    mocks.retrieveCustomer.mockRejectedValue({ code: "resource_missing" });
    expect(await getOrCreatePlatformStripeCustomerId({ userId: "member", deps })).toBe("cus_new");
  });
  it("preserves identity when Stripe has a transient/network failure", async () => {
    mocks.retrieveCustomer.mockRejectedValue(new Error("network offline"));
    await expect(getOrCreatePlatformStripeCustomerId({ userId: "member", deps })).rejects.toThrow("network offline");
    expect(mocks.setCustomerId).not.toHaveBeenCalled();
  });
  it("refuses an unknown or blank user identity", async () => {
    await expect(getOrCreatePlatformStripeCustomerId({ userId: " ", deps })).rejects.toThrow();
    expect(mocks.findUser).not.toHaveBeenCalled();
    mocks.findUser.mockResolvedValue(null);
    await expect(getOrCreatePlatformStripeCustomerId({ userId: "missing", deps })).rejects.toThrow();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });
  it("retries portal/checkout exactly once for a provably missing customer parameter", async () => {
    // Simulate the real DB contract: writes change what the next findUser reads.
    let storedCustomerId: string | null = "cus_old";
    mocks.findUser.mockImplementation(async () => ({
      email: "member@example.test", stripeCustomerId: storedCustomerId,
    }));
    mocks.setCustomerId.mockImplementation(async (_userId: string, newId: string | null) => {
      storedCustomerId = newId;
    });
    const operate = vi.fn().mockRejectedValueOnce({ code: "resource_missing", param: "customer" }).mockResolvedValueOnce("ok");
    expect(await withValidPlatformStripeCustomer({ userId: "member", deps, operate })).toBe("ok");
    expect(operate.mock.calls.map(c => c[0])).toEqual(["cus_old", "cus_new"]);
    expect(mocks.setCustomerId.mock.calls.map(c => c[1])).toEqual([null, "cus_new"]);
  });
  it("never retries on an unrelated missing resource", async () => {
    const operate = vi.fn().mockRejectedValue({ code: "resource_missing", param: "price" });
    await expect(withValidPlatformStripeCustomer({ userId: "member", deps, operate })).rejects.toEqual({code:"resource_missing",param:"price"});
    expect(operate).toHaveBeenCalledTimes(1);
    expect(mocks.setCustomerId).not.toHaveBeenCalled();
  });
  it("only classifies an explicit provider missing-customer error", () => {
    expect(isMissingPlatformStripeCustomerError({ code: "resource_missing" })).toBe(true);
    expect(isMissingPlatformStripeCustomerError(new Error("No such customer: cus_123"))).toBe(true);
    expect(isMissingPlatformStripeCustomerError(new Error("unauthorized"))).toBe(false);
    expect(isMissingPlatformStripeCustomerError(null)).toBe(false);
  });
});
