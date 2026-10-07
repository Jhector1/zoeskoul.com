import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RingButton from "./RingButton";

describe("shared Review RingButton", () => {
    it("renders the canonical progress presentation without framework routing", () => {
        const html = renderToStaticMarkup(
            React.createElement(RingButton, {
                navigationKey: "/en/review/module",
                navigate: vi.fn(),
                prefetchHref: vi.fn(),
                pct: 0.42,
                missedPct: 0.08,
                label: "Practice this module",
                sublabel: "Optional extra practice",
            }),
        );

        expect(html).toContain("ui-ring-button");
        expect(html).toContain("ui-progress-ring");
        expect(html).toContain("42%");
        expect(html).toContain("Practice this module");
        expect(html).toContain("Optional extra practice");
    });

    it("preserves the public disabled state", () => {
        const html = renderToStaticMarkup(
            React.createElement(RingButton, {
                navigationKey: "/en/review/module",
                navigate: vi.fn(),
                pct: 0,
                label: "Practice",
                disabled: true,
            }),
        );

        expect(html).toContain("disabled");
    });
});
