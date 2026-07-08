import { describe, expect, it } from "vitest";

import {
  challengeScreenshotFilename,
  computeChallengeShareCoverCrop,
} from "./capture";

describe("computeChallengeShareCoverCrop", () => {
  it("center-crops a standard 16:9 tab to 1200 by 630", () => {
    const crop = computeChallengeShareCoverCrop(1920, 1080);

    expect(crop.sourceX).toBe(0);
    expect(crop.sourceY).toBeCloseTo(36, 5);
    expect(crop.sourceWidth).toBe(1920);
    expect(crop.sourceHeight).toBeCloseTo(1008, 5);
  });

  it("center-crops the sides of a source wider than the social target", () => {
    const crop = computeChallengeShareCoverCrop(2560, 1080);

    expect(crop.sourceX).toBeCloseTo(251.428571, 5);
    expect(crop.sourceY).toBe(0);
    expect(crop.sourceWidth).toBeCloseTo(2057.142857, 5);
    expect(crop.sourceHeight).toBe(1080);
  });

  it("rejects invalid dimensions", () => {
    expect(() => computeChallengeShareCoverCrop(0, 1080)).toThrow(
      "Screenshot dimensions must be positive finite numbers.",
    );
  });
});

describe("challengeScreenshotFilename", () => {
  it("creates a safe PNG filename from the exercise key", () => {
    expect(challengeScreenshotFilename("Try: Car / Project #1")).toBe(
      "try-car-project-1-preview.png",
    );
  });
});
