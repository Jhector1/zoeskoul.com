import { describe, expect, it } from "vitest";
import { mayHydratePreparedDependencySource } from "./preparedDependencyReplayPolicy";

describe("K20D2A trusted dependency preparation handoff", () => {
  it("keeps ordinary 409 reconciliation strictly monotonic", () => {
    expect(mayHydratePreparedDependencySource(80, 80)).toBe(false);
    expect(mayHydratePreparedDependencySource(80, 81)).toBe(true);
    expect(mayHydratePreparedDependencySource(81, 80)).toBe(false);
  });
  it("permits equal CAS solely after a verified preparation callback", () => {
    expect(mayHydratePreparedDependencySource(80, 80, true)).toBe(true);
    expect(mayHydratePreparedDependencySource(81, 80, true)).toBe(false);
    expect(mayHydratePreparedDependencySource(80, 81, true)).toBe(true);
  });
  it("rejects invalid and fractional source tokens", () => {
    for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(mayHydratePreparedDependencySource(value, 80, true)).toBe(false);
      expect(mayHydratePreparedDependencySource(80, value, true)).toBe(false);
    }
  });
});
