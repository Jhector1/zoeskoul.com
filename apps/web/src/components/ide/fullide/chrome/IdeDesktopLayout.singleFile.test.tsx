import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import IdeDesktopLayout from "./IdeDesktopLayout";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) =>
        key === "openFileExplorer" ? "Open file explorer" : key,
}));

function renderLayout(explorer: React.ReactNode) {
    return renderToStaticMarkup(
        <IdeDesktopLayout
            splitRef={React.createRef<HTMLDivElement>()}
            leftPct={30}
            dividerValue={30}
            onMouseDownDivider={vi.fn()}
            onPointerDownDivider={vi.fn()}
            onKeyDownDivider={vi.fn()}
            explorer={explorer}
            editor={<div data-testid="mock-editor">Editor</div>}
            explorerCollapsed={true}
            onToggleExplorer={vi.fn()}
        />,
    );
}

describe("IdeDesktopLayout single-file presentation", () => {
    it("uses the full editor width and renders no Explorer opener when Explorer is unavailable", () => {
        const html = renderLayout(null);

        expect(html).not.toContain('aria-label="Open file explorer"');
        expect(html).not.toContain("48px minmax(0, 1fr)");
        expect(html).toContain("minmax(0, 1fr)");
        expect(html).toContain('data-testid="mock-editor"');
    });

    it("keeps the collapsed Explorer opener when Explorer is available", () => {
        const html = renderLayout(
            <div data-testid="mock-explorer">Files</div>,
        );

        expect(html).toContain('aria-label="Open file explorer"');
        expect(html).toContain("48px minmax(0, 1fr)");
        expect(html).toContain('data-testid="mock-editor"');
    });
});
