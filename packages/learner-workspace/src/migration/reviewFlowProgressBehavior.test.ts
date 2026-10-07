import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReviewLearningProgress from "../review/components/content/ReviewLearningProgress";

describe("Review flow/progress behavior", () => {
  it("renders no learning progress when activity is absent", () => {
    expect(
      renderToStaticMarkup(
        React.createElement(
          ReviewLearningProgress,
          {},
        ),
      ),
    ).toBe("");
  });

  it("renders accessible progress from a learning-progress track", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewLearningProgress,
        {
          activity: {
            label: "Topic",
            total: 3,
            currentIndex: 1,
            completedIndexes: [0],
            revealedIndexes: [],
          },
        },
      ),
    );

    expect(html).toContain(
      'data-testid="review-learning-progress"',
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Topic");
  });
});
