import { beforeEach, describe, expect, it } from "vitest";
import {
  boundedPreviewTimingDuration,
  previewBrowserTimingSnapshot,
  previewServerTimingHeader,
  recordPreviewBrowserTiming,
  resetPreviewBrowserTimingForTests,
} from "./previewPerformance";

beforeEach(resetPreviewBrowserTimingForTests);

describe("preview timing sanitization", () => {
  it("formats only finite bounded standard Server-Timing metrics", () => {
    expect(previewServerTimingHeader([
      {name:"gateway",durationMs:12.345},
      {name:"bad;desc=secret",durationMs:3},
      {name:"runner",durationMs:Number.NaN},
      {name:"vite_upstream",durationMs:100_000_000},
    ])).toBe("gateway;dur=12.3, vite_upstream;dur=86400000.0");
    expect(boundedPreviewTimingDuration(-1)).toBeNull();
  });

  it("retains only bounded categorical browser measurements without identities", () => {
    for (let index = 0; index < 70; index += 1) {
      recordPreviewBrowserTiming({
        stage:"document_to_rendered",kind:"refresh",outcome:"ok",durationMs:index,
      });
    }
    const snapshot = previewBrowserTimingSnapshot();
    expect(snapshot).toHaveLength(64);
    expect(snapshot[0]?.durationMs).toBe(6);
    expect(JSON.stringify(snapshot)).not.toContain("capability");
    expect(JSON.stringify(snapshot)).not.toContain("projectId");
  });

  it("records unavailable stages explicitly without inventing zero duration", () => {
    recordPreviewBrowserTiming({stage:"stylesheet_delivery",kind:"navigation",outcome:"unavailable"});
    expect(previewBrowserTimingSnapshot()).toEqual([{
      stage:"stylesheet_delivery",kind:"navigation",outcome:"unavailable",
    }]);
  });
});
