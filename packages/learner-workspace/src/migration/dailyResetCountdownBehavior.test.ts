import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DailyResetCountdown from "../practice/completion/DailyResetCountdown";

describe("DailyResetCountdown behavior", () => {
  it("renders nothing without a reset timestamp", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        DailyResetCountdown,
        {
          nextResetAt: null,
          nextLabel: "Next",
          readyLabel: "Ready",
          utcNote: "UTC",
          formatCountdown: () => "00:00:00",
        },
      ),
    );

    expect(html).toBe("");
  });

  it("renders injected copy and a formatted countdown", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        DailyResetCountdown,
        {
          nextResetAt: "2099-01-01T00:00:00.000Z",
          compact: true,
          nextLabel: "Next reset",
          readyLabel: "Ready",
          utcNote: "Resets at UTC midnight",
          formatCountdown: ({
            hours,
            minutes,
            seconds,
          }) =>
            `${hours}:${minutes}:${seconds}`,
        },
      ),
    );

    expect(html).toContain("Next reset");
    expect(html).toContain(
      "Resets at UTC midnight",
    );
    expect(html).toContain("ui-kicker");
  });
});
