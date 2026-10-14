import { describe, expect, it } from "vitest";

import {
  REVIEW_CENTER_RECOVERABLE_PX,
  REVIEW_PANEL_RECOVERABLE_PX,
  resolveReviewPanelBounds,
  resolveReviewPanelWidth,
} from "./useResizablePanels";

describe("review panel resize geometry", () => {
  it("uses viewport geometry instead of fixed product-era width caps", () => {
    expect(
      resolveReviewPanelBounds({
        containerWidth: 1_600,
        oppositeOccupiedWidth: 0,
        handleWidth: 6,
      }),
    ).toEqual({
      minimum: REVIEW_PANEL_RECOVERABLE_PX,
      maximum: 1_600 - 6 - REVIEW_CENTER_RECOVERABLE_PX,
    });
  });

  it("keeps the opposite rail and center recoverable", () => {
    expect(
      resolveReviewPanelBounds({
        containerWidth: 1_600,
        oppositeOccupiedWidth: 306,
        handleWidth: 6,
      }),
    ).toEqual({ minimum: 48, maximum: 1_240 });
  });

  it("lets either rail reach both near-edge limits", () => {
    const common = {
      containerLeft: 100,
      containerWidth: 1_000,
      minimum: 48,
      maximum: 946,
    };

    expect(resolveReviewPanelWidth({ ...common, kind: "left", clientX: -500 })).toBe(48);
    expect(resolveReviewPanelWidth({ ...common, kind: "left", clientX: 5_000 })).toBe(946);
    expect(resolveReviewPanelWidth({ ...common, kind: "right", clientX: 5_000 })).toBe(48);
    expect(resolveReviewPanelWidth({ ...common, kind: "right", clientX: -500 })).toBe(946);
  });
});
