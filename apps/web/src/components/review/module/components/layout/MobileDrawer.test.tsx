import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import MobileDrawer from "./MobileDrawer";

describe("MobileDrawer", () => {
    it("uses the shared UI palette instead of hard-coded light and dark colors", () => {
        const html = renderToStaticMarkup(
            <MobileDrawer
                open
                side="left"
                title="Course modules"
                reduceMotion
                onClose={vi.fn()}
            >
                <div>Drawer content</div>
            </MobileDrawer>,
        );

        expect(html).toContain("ui-review-drawer-backdrop");
        expect(html).toContain("ui-review-mobile-drawer");
        expect(html).toContain("ui-review-mobile-drawer-header");
        expect(html).toContain("ui-title-sm");
        expect(html).toContain("ui-btn-secondary");
        expect(html).not.toMatch(/(?:bg|text|border)-(?:black|white|neutral|amber|rose)-?/);
        expect(html).not.toContain("dark:");
        expect(html).not.toContain("#0b0d12");
    });
    it("keeps the drawer mounted while closed so first open does not pay mount cost", () => {
        const html = renderToStaticMarkup(
            <MobileDrawer
                open={false}
                side="left"
                title="Course modules"
                reduceMotion
                onClose={vi.fn()}
            >
                <div>Drawer content</div>
            </MobileDrawer>,
        );

        expect(html).toContain("ui-review-mobile-drawer");
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain("invisible");
        expect(html).toContain("Drawer content");
    });

});
