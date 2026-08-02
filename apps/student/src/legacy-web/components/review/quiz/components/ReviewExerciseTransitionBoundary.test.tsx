import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ReviewDestinationTransitionProvider,
  type ReviewDestinationTransitionValue,
} from "@/components/review/module/navigation/ReviewDestinationTransitionContext";
import ReviewExerciseTransitionBoundary from "./ReviewExerciseTransitionBoundary";

function render(active: boolean, transitioning: boolean) {
  const value: ReviewDestinationTransitionValue = {
    isDestinationTransitioning: transitioning,
    showExerciseSkeleton: transitioning,
    showEditorLoading: transitioning,
    destinationIdentity: transitioning ? "/next" : null,
    destinationPublished: transitioning,
    destinationReady: false,
    expectedExerciseOwnerKey: "exercise:next",
    expectedGeneration: 4,
    reportExerciseReady: vi.fn(),
    reportEditorReady: vi.fn(),
  };

  return renderToStaticMarkup(
    <ReviewDestinationTransitionProvider value={value}>
      <ReviewExerciseTransitionBoundary
        active={active}
        ready
        ownerKey="exercise:next"
      >
        <div data-testid="destination-exercise">Exercise</div>
      </ReviewExerciseTransitionBoundary>
    </ReviewDestinationTransitionProvider>,
  );
}

describe("ReviewExerciseTransitionBoundary", () => {
  it("keeps destination content mounted behind a stable local skeleton", () => {
    const html = render(true, true);

    expect(html).toContain('data-testid="destination-exercise"');
    expect(html).toContain('data-testid="review-exercise-transition-skeleton"');
    expect(html).toContain("min-height:420px");
    expect(html).toContain("invisible pointer-events-none");
  });

  it("does not skeletonize an inactive question", () => {
    const html = render(false, true);

    expect(html).toContain('data-testid="destination-exercise"');
    expect(html).not.toContain('data-testid="review-exercise-transition-skeleton"');
  });
});
