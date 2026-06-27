import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModuleHeader from "./ReviewModuleHeader";

vi.mock("@/components/HeaderSlick", () => ({
    default: ({ slot }: { slot: React.ReactNode }) => <div data-testid="header-slick">{slot}</div>,
}));

vi.mock("@/components/ui/NavButton", () => ({
    default: ({
        children,
        href = "",
        loadingText: _loadingText,
        fullWidth: _fullWidth,
        showSpinner: _showSpinner,
        hardReload: _hardReload,
        hardReloadCurrent: _hardReloadCurrent,
        prefetch: _prefetch,
        ...props
    }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function renderHeader(overrides: Partial<React.ComponentProps<typeof ReviewModuleHeader>> = {}) {
    return renderToStaticMarkup(
        <ReviewModuleHeader
            locale="en"
            toolsUiEnabled
            showDesktopLeft={false}
            showDesktopRight={false}
            leftCollapsed={true}
            rightCollapsed={true}
            modulesHref="/en/subjects/python/modules"
            onToggleLeftPanel={vi.fn()}
            onToggleRightPanel={vi.fn()}
            resetOptions={[
                {
                    id: "topic",
                    label: "This topic",
                    description: "Clear the current topic and start it over.",
                    onSelect: vi.fn(),
                },
            ]}
            onPrevTopic={vi.fn()}
            onNextTopic={vi.fn()}
            prevTopic={{ id: "topic-1" }}
            nextTopic={{ id: "topic-2" }}
            unlockAll={false}
            viewIsComplete={false}
            headerGamification={null}
            {...overrides}
        />,
    );
}

describe("ReviewModuleHeader compact toolbar", () => {
    it("keeps Topics and Tools buttons when desktop side panels are not visible", () => {
        const html = renderHeader();

        expect(html).toContain("Topics");
        expect(html).toContain("Tools");
        expect(html).toContain("Reset");
    });

    it("hides the duplicate desktop Topics and Tools buttons in compact mode", () => {
        const html = renderHeader({
            showDesktopLeft: true,
            showDesktopRight: true,
            leftCollapsed: false,
            rightCollapsed: false,
        });

        expect(html).not.toContain("Topics");
        expect(html).not.toContain("Tools");
        expect(html).toContain("Reset");
        expect(html).toContain("Modules");
    });

    it("keeps the reopen buttons when either desktop panel is collapsed", () => {
        const html = renderHeader({
            showDesktopLeft: true,
            showDesktopRight: true,
            leftCollapsed: true,
            rightCollapsed: true,
        });

        expect(html).toContain("Topics");
        expect(html).toContain("Tools");
    });

    it("hides the Tools button when the active card disallows opening tools", () => {
        const html = renderHeader({
            toolsToggleAllowed: false,
        });

        expect(html).toContain("Topics");
        expect(html).not.toContain("Tools");
    });
});
