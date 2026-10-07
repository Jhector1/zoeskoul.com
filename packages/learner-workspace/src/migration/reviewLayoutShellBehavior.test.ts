import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReviewModuleLeftRail from "../review/components/layout/ReviewModuleLeftRail";
import ReviewModuleRightRail from "../review/components/layout/ReviewModuleRightRail";
import ReviewModuleStackedTools from "../review/components/layout/ReviewModuleStackedTools";

describe("Review layout shell behavior", () => {
  it("keeps left rail hidden when desktop-left is disabled", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewModuleLeftRail, {
        showDesktopLeft: false,
        leftCollapsed: false,
        leftW: 280,
        onResizeStart: () => {},
        padStyle: {},
        sidebar: React.createElement("div", null, "sidebar"),
      }),
    );
    expect(html).toBe("");
  });

  it("renders left rail content and resize handle when expanded", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewModuleLeftRail, {
        showDesktopLeft: true,
        leftCollapsed: false,
        leftW: 280,
        onResizeStart: () => {},
        padStyle: {},
        sidebar: React.createElement("div", null, "sidebar"),
      }),
    );
    expect(html).toContain("sidebar");
    expect(html).toContain("Drag to resize sidebar");
    expect(html).toContain("width:280px");
  });

  it("keeps right rail hidden when desktop-right is disabled", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewModuleRightRail, {
        showDesktopRight: false,
        rightCollapsed: false,
        rightW: 420,
        onResizeStart: () => {},
        toolsPanel: React.createElement("div", null, "tools"),
      }),
    );
    expect(html).toBe("");
  });

  it("preserves stacked-tools visibility and tab frame", () => {
    const hidden = renderToStaticMarkup(
      React.createElement(ReviewModuleStackedTools, {
        showDesktopRight: true,
        rightCollapsed: false,
        shouldRenderStackedTools: true,
        displayMode: "tab",
        toolsPanel: React.createElement("div", null, "tools"),
      }),
    );
    expect(hidden).toBe("");

    const visible = renderToStaticMarkup(
      React.createElement(ReviewModuleStackedTools, {
        showDesktopRight: false,
        rightCollapsed: false,
        shouldRenderStackedTools: true,
        displayMode: "tab",
        toolsPanel: React.createElement("div", null, "tools"),
      }),
    );
    expect(visible).toContain(
      'data-testid="review-stacked-tools"',
    );
    expect(visible).toContain("tools");
  });
});
