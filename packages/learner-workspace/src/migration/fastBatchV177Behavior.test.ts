import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReviewModuleSkeleton from "../review/ReviewModuleSkeleton";
import SummaryViewSkeleton from "../practice/shell/SummaryViewSkeleton";

describe("V177 fast-batch behavior smoke", () => {
  it("renders the Review module skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReviewModuleSkeleton,
        {
          leftCollapsed: false,
          rightCollapsed: false,
          leftW: 280,
          rightW: 360,
        },
      ),
    );

    expect(html).toContain("ui-skel");
    expect(html).toContain("width:280px");
    expect(html).toContain("width:360px");
  });

  it("renders the Practice summary skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SummaryViewSkeleton,
      ),
    );

    expect(html).toContain("ui-container");
    expect(html).toContain("ui-shimmer");
  });
});
