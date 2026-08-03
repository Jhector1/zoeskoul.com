import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewCourseModulesDrawer from "./ReviewCourseModulesDrawer";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => {
        const messages: Record<string, string> = {
            title: "Course modules",
            kicker: "Course outline",
            description: "Jump to another module without leaving your lesson workspace.",
            current: "Current",
            locked: "Locked",
            currentDescription: "You are working in this module.",
            lockedDescription: "Open the access page for this module.",
            openDescription: "Open this module.",
            loading: "Loading course modules...",
            error: "Course modules could not be loaded.",
            empty: "No published modules are available yet.",
        };

        return messages[key] ?? key;
    },
}));

vi.mock("./MobileDrawer", () => ({
    default: ({ open, title, children }: any) =>
        open ? (
            <aside aria-label={title} data-testid="mobile-drawer-shell">
                {children}
            </aside>
        ) : null,
}));

const modules = [
    {
        slug: "module-1",
        title: "Python Foundations",
        order: 1,
        index: 0,
        current: true,
        locked: false,
        billingHref: null,
    },
    {
        slug: "module-2",
        title: "Object-Oriented Foundations",
        order: 2,
        index: 1,
        current: false,
        locked: false,
        billingHref: null,
    },
    {
        slug: "module-3",
        title: "Advanced Projects",
        order: 3,
        index: 2,
        current: false,
        locked: true,
        billingHref: "/en/billing",
    },
];

describe("ReviewCourseModulesDrawer", () => {
    it("shows the complete course outline with current and locked states", () => {
        const html = renderToStaticMarkup(
            <ReviewCourseModulesDrawer
                open
                reduceMotion
                onClose={vi.fn()}
                modules={modules}
                loading={false}
                error={false}
                onSelectModule={vi.fn()}
            />,
        );

        expect(html).toContain('data-testid="review-course-modules-drawer"');
        expect(html).toContain("Python Foundations");
        expect(html).toContain("Object-Oriented Foundations");
        expect(html).toContain("Advanced Projects");
        expect(html).toContain("Current");
        expect(html).toContain("Locked");
        expect(html).toContain('aria-current="page"');
        expect(html).toContain("ui-review-topic-btn-active");
        expect(html).toContain("ui-review-topic-btn");
        expect(html).toContain("ui-pill-warn");
        expect(html).not.toMatch(/(?:bg|text|border)-(?:black|white|neutral|amber|rose)-?/);
        expect(html).not.toContain("dark:");
    });

    it("renders a loading state before module access resolves", () => {
        const html = renderToStaticMarkup(
            <ReviewCourseModulesDrawer
                open
                reduceMotion
                onClose={vi.fn()}
                modules={[]}
                loading
                error={false}
                onSelectModule={vi.fn()}
            />,
        );

        expect(html).toContain("Loading course modules...");
        expect(html).toContain('role="status"');
    });
});
