import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModuleHeader from "./ReviewModuleHeader";

vi.mock("next-intl", () => ({
    useTranslations: (namespace?: string) => {
        const messages: Record<string, string> = {
            "review.header.resetMenuAriaLabel": "Reset progress options",
            "review.header.resetMenuTitle": "Reset progress",
            "review.header.resetMenuDescription":
                "Choose how much work to clear. You will confirm before anything is deleted.",
            "review.header.modulesTitle": "Go to modules",
            "review.header.modulesLoading": "Opening modules...",
            "review.header.modulesButton": "← Modules",
            "review.header.topicsTitle": "Topics",
            "review.header.topicsButton": "Topics",
            "review.header.topicsButtonCollapsed": "Topics ▶",
            "review.header.toolsTitle": "Tools",
            "review.header.toolsButtonCollapsed": "Tools ▶",
            "review.header.toolsButtonExpanded": "Tools ◀",
            "review.header.resetButton": "Reset",
            "review.header.prevTitle": "Previous topic",
            "review.header.prevDisabledTitle": "No previous topic",
            "review.header.nextTitle": "Next topic",
            "review.header.nextDisabledTitle": "No next topic",
            "review.header.nextLockedTitle": "Complete the topic to continue",
            "review.header.saveStatus.saving": "Saving...",
            "review.header.saveStatus.saved": "Saved",
            "review.header.saveStatus.error": "Save failed",
            "review.header.saveStatus.conflict": "Sync conflict",
            "review.header.level": "Lv {level}",
            "review.header.xp": "{count} XP",
        };

        return (key: string, values?: Record<string, string | number>) => {
            const fullKey = namespace ? `${namespace}.${key}` : key;
            const template = messages[fullKey] ?? fullKey;
            return template.replace(/\{(\w+)\}/g, (_, token) => String(values?.[token] ?? ""));
        };
    },
}));

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
