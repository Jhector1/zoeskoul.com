import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModuleStackedTools from "./ReviewModuleStackedTools";

vi.mock("@/components/tools/ToolsPanel", () => ({
    default: () => <div data-testid="mock-tools-panel" />,
}));

describe("ReviewModuleStackedTools", () => {
    it("renders a stacked tools panel with a fixed responsive height on non-desktop layouts even before binding", () => {
        const html = renderToStaticMarkup(
            <ReviewModuleStackedTools
                showDesktopRight={false}
                rightCollapsed={false}
                shouldRenderStackedTools={true}
                toolsPanelProps={{
                    onCollapse: vi.fn(),
                    rightBodyRef: { current: null },
                    codeRunnerRegionH: 480,
                    toolHydrated: true,
                    toolLang: "python",
                    toolCode: "print('hi')",
                    toolStdin: "",
                    toolWorkspace: null,
                    toolSqlDialect: "sqlite",
                    subjectSlug: "python",
                    moduleId: "module-1",
                    locale: "en",
                    codeEnabled: true,
                    onChangeCode: vi.fn(),
                    onChangeStdin: vi.fn(),
                }}
            />,
        );

        expect(html).toContain('data-testid="review-stacked-tools"');
        expect(html).toContain('data-testid="review-stacked-tools-frame"');
        expect(html).toContain("h-[clamp(24rem,68vh,44rem)]");
        expect(html).toContain('data-testid="mock-tools-panel"');
    });
});
