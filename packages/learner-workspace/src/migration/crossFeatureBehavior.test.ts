import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { resolvePracticeMobilePrimaryAction } from "../practice/shell/mobileActionState";
import PracticeMobileSheet from "../practice/shell/PracticeMobileSheet";

describe("cross-feature shared behavior", () => {
    it("keeps mobile practice primary-action policy", () => {
        expect(
            resolvePracticeMobilePrimaryAction({
                hasCurrent: true,
                submitted: false,
                finalized: false,
                outOfAttempts: false,
                canGoNext: true,
                revealAvailable: true,
            }),
        ).toBe("submit");

        expect(
            resolvePracticeMobilePrimaryAction({
                hasCurrent: true,
                submitted: true,
                finalized: true,
                outOfAttempts: false,
                canGoNext: true,
                revealAvailable: false,
            }),
        ).toBe("next");
    });

    it("renders the shared practice mobile sheet contract", () => {
        const html = renderToStaticMarkup(
            React.createElement(
                PracticeMobileSheet,
                {
                    open: true,
                    title: "Tools",
                    closeLabel: "Close",
                    onClose: vi.fn(),
                },
                React.createElement("div", null, "Body"),
            ),
        );

        expect(html).toContain('data-testid="practice-mobile-sheet"');
        expect(html).toContain('role="dialog"');
        expect(html).toContain("Tools");
        expect(html).toContain("Close");
        expect(html).toContain("Body");
    });
});
