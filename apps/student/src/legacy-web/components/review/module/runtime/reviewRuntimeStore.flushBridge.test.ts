import { afterEach, describe, expect, it, vi } from "vitest";

import { useReviewRuntimeStore } from "./reviewRuntimeStore";

describe("reviewRuntimeStore tool snapshot flush bridge", () => {
  afterEach(() => {
    useReviewRuntimeStore.getState().setFlushToolSnapshotCallback(null);
  });

  it("registers the imperative callback without publishing a Zustand update", () => {
    const callback = vi.fn();
    const subscriber = vi.fn();
    const unsubscribe = useReviewRuntimeStore.subscribe(subscriber);

    useReviewRuntimeStore.getState().setFlushToolSnapshotCallback(callback);

    expect(subscriber).not.toHaveBeenCalled();

    useReviewRuntimeStore.getState().flushToolSnapshot();
    expect(callback).toHaveBeenCalledTimes(1);

    useReviewRuntimeStore.getState().setFlushToolSnapshotCallback(null);
    expect(subscriber).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("always flushes through the latest registered provider callback", () => {
    const first = vi.fn();
    const second = vi.fn();

    useReviewRuntimeStore.getState().setFlushToolSnapshotCallback(first);
    useReviewRuntimeStore.getState().setFlushToolSnapshotCallback(second);
    useReviewRuntimeStore.getState().flushToolSnapshot();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
