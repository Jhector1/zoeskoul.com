import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import IdeMobileLayout from "./IdeMobileLayout";

describe("IdeMobileLayout", () => {
    it("keeps a visible file explorer rail when the mobile explorer is closed", () => {
        const html = renderToStaticMarkup(
            <IdeMobileLayout
                open={false}
                onOpen={vi.fn()}
                onClose={vi.fn()}
                explorer={<div data-testid="mock-explorer">Files</div>}
                editor={<div data-testid="mock-editor">Editor</div>}
            />,
        );

        expect(html).toContain('data-testid="mobile-explorer-rail"');
        expect(html).toContain('aria-label="Open file explorer"');
        expect(html).toContain('data-testid="mock-editor"');
    });

    it("can omit the explorer rail for terminal-only or explorer-disabled layouts", () => {
        const html = renderToStaticMarkup(
            <IdeMobileLayout
                open={false}
                onOpen={vi.fn()}
                onClose={vi.fn()}
                showExplorerRail={false}
                explorer={<div data-testid="mock-explorer">Files</div>}
                editor={<div data-testid="mock-editor">Editor</div>}
            />,
        );

        expect(html).not.toContain('data-testid="mobile-explorer-rail"');
        expect(html).not.toContain('aria-label="Open file explorer"');
        expect(html).toContain('data-testid="mock-editor"');
    });
});
