import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModuleLayout from "./ReviewModuleLayout";

vi.mock("../overlays/ReviewSkeletonSwap", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ReviewModuleLayout supplemental header", () => {
  it("keeps the normal lesson header first and places tutoring controls below it", () => {
    const html = renderToStaticMarkup(
      <ReviewModuleLayout
        ariaBusy={false}
        reduceMotion
        showMask={false}
        showSkeleton={false}
        leftCollapsed
        rightCollapsed
        leftW={280}
        rightW={420}
        header={<div data-testid="normal-header">Modules Tools Reset Saved</div>}
        supplementalHeader={<div data-testid="workspace-header">Tutor workspace</div>}
        body={<main data-testid="lesson-body">Lesson</main>}
      />,
    );

    const normalHeader = html.indexOf('data-testid="normal-header"');
    const workspaceHeader = html.indexOf('data-testid="workspace-header"');
    const lessonBody = html.indexOf('data-testid="lesson-body"');

    expect(normalHeader).toBeGreaterThanOrEqual(0);
    expect(workspaceHeader).toBeGreaterThan(normalHeader);
    expect(lessonBody).toBeGreaterThan(workspaceHeader);
    expect(html).toContain('data-review-supplemental-header="true"');
  });
});
