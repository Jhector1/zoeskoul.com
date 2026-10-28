import {describe, expect, it} from "vitest";
import {activeSavedHistoryVersion} from "./activeSavedHistoryVersion";

describe("active saved history selection", () => {
  it("displays V2 as current even when the new immutable head is V15", () => {
    expect(activeSavedHistoryVersion(15, {activeHistoryVersion:2, activeHistorySourceVersion:15})).toBe(2);
  });
  it("supports existing restore metadata from before the active marker", () => {
    expect(activeSavedHistoryVersion(15,{lastMutation:"history-restore",restoredFromVersion:2,restoredSnapshotVersion:15})).toBe(2);
  });
  it("returns to newest source revision after a new code edit", () => {
    expect(activeSavedHistoryVersion(16,{activeHistoryVersion:2,activeHistorySourceVersion:15,
      lastMutation:"history-restore",restoredFromVersion:2,restoredSnapshotVersion:15})).toBe(16);
  });
  it("selects a snapshot with the same files (V15) without changing the CAS token", () => {
    expect(activeSavedHistoryVersion(16,{activeHistoryVersion:15,activeHistorySourceVersion:16})).toBe(15);
    expect(activeSavedHistoryVersion(16,{activeHistoryVersion:2,activeHistorySourceVersion:16})).toBe(2);
  });
  it("rejects malformed, out-of-range, and stale markers", () => {
    for (const meta of [null, {}, {activeHistoryVersion:0,activeHistorySourceVersion:15},
      {activeHistoryVersion:17,activeHistorySourceVersion:15},
      {activeHistoryVersion:2,activeHistorySourceVersion:14},
      {activeHistoryVersion:"2",activeHistorySourceVersion:15}]) {
      expect(activeSavedHistoryVersion(15,meta)).toBe(15);
    }
  });
});
