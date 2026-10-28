import { describe, expect, it, vi } from "vitest";
import {
  MAX_ZOEBUILD_CONCURRENT_BUILDS,
  ZoeBuildBuildCapacityError,
  withZoeBuildBuildSlot,
  zoeBuildBuildCapacitySnapshot,
  zoeBuildBootstrapQueueSnapshot,
  withZoeBuildQueuedBootstrapSlot,
  ZOEBUILD_BOOTSTRAP_MAX_WAITING,
  ZOEBUILD_BOOTSTRAP_QUEUE_WAIT_MS,
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


describe("trusted bootstrap single-flight and bounded FIFO admission", () => {
  it("coalesces exact duplicate jobs and waits instead of starting a second container", async () => {
    let releaseFirst!: () => void;
    const hold = new Promise<void>(resolve => { releaseFirst = resolve; });
    const runs: string[] = [];
    const first = withZoeBuildBuildSlot(async () => { await hold; runs.push("production"); });
    const bootstrap = withZoeBuildQueuedBootstrapSlot("same-source", async () => {
      runs.push("bootstrap"); return "lock";
    });
    const duplicate = withZoeBuildQueuedBootstrapSlot("same-source", async () => {
      throw new Error("duplicate must not start");
    });
    expect(duplicate).toBe(bootstrap);
    expect(zoeBuildBootstrapQueueSnapshot()).toMatchObject({waiting:1,duplicateKeys:1});
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(1);
    releaseFirst();
    await first;
    await expect(bootstrap).resolves.toBe("lock");
    expect(runs).toEqual(["production","bootstrap"]);
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
    expect(zoeBuildBootstrapQueueSnapshot()).toMatchObject({waiting:0,duplicateKeys:0});
  });

  it("reserves the single slot for the next waiter in FIFO order", async () => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = withZoeBuildBuildSlot(async () => { await hold; });
    const order: string[] = [];
    const a = withZoeBuildQueuedBootstrapSlot("a", async () => {order.push("a");});
    const b = withZoeBuildQueuedBootstrapSlot("b", async () => {order.push("b");});
    release();
    await Promise.all([first,a,b]);
    expect(order).toEqual(["a","b"]);
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
  });

  it("expires only waiting jobs; a full queue never exceeds the container limit", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = withZoeBuildBuildSlot(async () => { await hold; });
    const queued = Array.from({length: ZOEBUILD_BOOTSTRAP_MAX_WAITING}, (_,i) =>
      withZoeBuildQueuedBootstrapSlot(`pending-${i}`, async () => "ran"));
    const excess = withZoeBuildQueuedBootstrapSlot("excess", async () => "never");
    const queuedChecks = queued.map(job => expect(job).rejects.toBeInstanceOf(ZoeBuildBuildCapacityError));
    try {
      await expect(excess).rejects.toBeInstanceOf(ZoeBuildBuildCapacityError);
      expect(zoeBuildBuildCapacitySnapshot().active).toBe(1);
      await vi.advanceTimersByTimeAsync(ZOEBUILD_BOOTSTRAP_QUEUE_WAIT_MS);
      await Promise.all(queuedChecks);
      expect(zoeBuildBootstrapQueueSnapshot().waiting).toBe(0);
    } finally {
      release();
      await first;
      vi.useRealTimers();
    }
    expect(zoeBuildBuildCapacitySnapshot().active).toBe(0);
  });
});
