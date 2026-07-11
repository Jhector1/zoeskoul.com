import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import MobileDrawer from "./MobileDrawer";

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
        button: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: any) => (
            <button {...props} />
        ),
        aside: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: any) => (
            <aside {...props} />
        ),
    },
}));

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
});
