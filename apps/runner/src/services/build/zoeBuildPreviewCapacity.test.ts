import { describe, expect, it } from "vitest";
import {
  assertZoeBuildPreviewCapacity,
  ZoeBuildPreviewCapacityError,
  ZOEBUILD_MAX_CONCURRENT_PREVIEWS,
} from "./zoeBuildPreviewCapacity.js";

describe("ZoeBuild preview capacity", () => {
  it("starts with exactly one available slot", () => {
    expect(ZOEBUILD_MAX_CONCURRENT_PREVIEWS).toBe(1);
    expect(() => assertZoeBuildPreviewCapacity(0, 0)).not.toThrow();
  });
  it("rejects another start while a live preview occupies the slot", () => {
    expect(() => assertZoeBuildPreviewCapacity(1, 0)).toThrow(ZoeBuildPreviewCapacityError);
  });
  it("rejects a racing start while another preview is preparing", () => {
    expect(() => assertZoeBuildPreviewCapacity(0, 1)).toThrow(ZoeBuildPreviewCapacityError);
  });
  it("releases capacity after the runtime's cleanup removes the preview", () => {
    expect(() => assertZoeBuildPreviewCapacity(1, 0)).toThrow();
    expect(() => assertZoeBuildPreviewCapacity(0, 0)).not.toThrow();
  });
  it("handles over-capacity counts and maps contention to the existing 429 handler", () => {
    expect(() => assertZoeBuildPreviewCapacity(2, 2)).toThrow(/Runner is busy/);
  });
  it("fails closed for invalid counters", () => {
    for (const pair of [[-1,0],[0,-1],[0,0.5],[NaN,0],[Infinity,0]] as const) {
      expect(() => assertZoeBuildPreviewCapacity(pair[0],pair[1])).toThrow(/Invalid/);
    }
  });
});
