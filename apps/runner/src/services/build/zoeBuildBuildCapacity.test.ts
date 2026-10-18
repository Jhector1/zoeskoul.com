import { describe, expect, it } from "vitest";
import {
  MAX_ZOEBUILD_CONCURRENT_BUILDS,
  ZoeBuildBuildCapacityError,
  withZoeBuildBuildSlot,
  zoeBuildBuildCapacitySnapshot,
} from "./zoeBuildBuildCapacity.js";

describe("ZoeBuild one-shot build admission on the shared runner", () => {
  it("starts with a strict one-job budget", () => {
    expect(MAX_ZOEBUILD_CONCURRENT_BUILDS).toBe(1);
    expect(zoeBuildBuildCapacitySnapshot()).toEqual({ active: 0, limit: 1 });
  });

  it("rejects concurrent bootstrap or production work without queuing", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const first = withZoeBuildBuildSlot(async () => { await hold; return "first"; });
    try {
      expect(zoeBuildBuildCapacitySnapshot()).toEqual({ active: 1, limit: 1 });
      let secondRan = false;
      await expect(withZoeBuildBuildSlot(async () => {
        secondRan = true;
        return "second";
      })).rejects.toBeInstanceOf(ZoeBuildBuildCapacityError);
      expect(secondRan).toBe(false);
      expect(zoeBuildBuildCapacitySnapshot().active).toBe(1);
    } finally {
      release();
      await expect(first).resolves.toBe("first");
    }
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
  });

  it("releases capacity when an async job fails", async () => {
    await expect(withZoeBuildBuildSlot(async () => {
      throw new Error("isolated job failed");
    })).rejects.toThrow("isolated job failed");
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
    await expect(withZoeBuildBuildSlot(async () => "recovered")).resolves.toBe("recovered");
  });

  it("releases capacity when executor throws synchronously", async () => {
    await expect(withZoeBuildBuildSlot(() => {
      throw new Error("executor setup failed");
    })).rejects.toThrow("executor setup failed");
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
  });
});
