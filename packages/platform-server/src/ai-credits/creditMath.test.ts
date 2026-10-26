import { describe, expect, it } from "vitest";
import {
  allocateAiCreditUnits, AiCreditError, providerNanoUsdToCreditUnits,
  type AiCreditConversion,
} from "./creditMath";

const conversion: AiCreditConversion = {
  versionId: "credit-v1", creditUnitsPerCredit: "1000000",
  creditValueUsdNano: "10000000", markupNumerator: "5", markupDenominator: "4",
};
const now = new Date("2026-10-19T10:00:00Z");
describe("deterministic AI credit accounting", () => {
  it("converts provider price exactly with a persisted rational markup", () => {
    expect(providerNanoUsdToCreditUnits("10000000", conversion)).toBe(1250000n);
    expect(providerNanoUsdToCreditUnits("1", conversion)).toBe(1n);
    expect(providerNanoUsdToCreditUnits("0", conversion)).toBe(0n);
  });
  it("rejects invalid values and bigint overflow", () => {
    expect(() => providerNanoUsdToCreditUnits("NaN", conversion)).toThrow(AiCreditError);
    expect(() => providerNanoUsdToCreditUnits("-1", conversion)).toThrow(AiCreditError);
    expect(() => providerNanoUsdToCreditUnits("9999999999999999999999999999", conversion))
      .toThrow("CHARGE_TOO_LARGE");
    expect(() => providerNanoUsdToCreditUnits("10", { ...conversion, markupDenominator: "0" }))
      .toThrow("INVALID_MARKUP_DENOMINATOR");
  });
  it("uses subscription credits before purchased credits, by expiry", () => {
    const slots = [
      { id: "p", kind: "purchased" as const, availableUnits: 200n, expiresAt: null, createdAt: now },
      { id: "s1", kind: "subscription" as const, availableUnits: 100n, expiresAt: new Date("2026-11-01"), createdAt: now },
      { id: "s2", kind: "subscription" as const, availableUnits: 50n, expiresAt: new Date("2026-10-31"), createdAt: now },
    ];
    expect(allocateAiCreditUnits(slots, 180n, now)).toEqual([
      { lotId: "s2", units: 50n }, { lotId: "s1", units: 100n }, { lotId: "p", units: 30n },
    ]);
  });
  it("never reserves expired, empty, or insufficient credit lots", () => {
    const slots = [
      { id: "expired", kind: "subscription" as const, availableUnits: 100n,
        expiresAt: new Date("2026-10-01"), createdAt: now },
    ];
    expect(() => allocateAiCreditUnits(slots, 1n, now)).toThrow("INSUFFICIENT_CREDITS");
    expect(() => allocateAiCreditUnits(slots, 0n, now)).toThrow("INVALID_RESERVATION");
  });
});
