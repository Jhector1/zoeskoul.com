import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuizBlockSkeleton } from "@zoeskoul/learner-ui/components/QuizBlockSkeleton";

describe("shared QuizBlockSkeleton behavior", () => {
  it("preserves the shared quiz loading surface", () => {
    const html = renderToStaticMarkup(
      React.createElement(QuizBlockSkeleton),
    );

    expect(html).toContain("ui-skel");
    expect(
      html.match(/ui-skel/g)?.length ?? 0,
    ).toBeGreaterThan(3);
  });
});
