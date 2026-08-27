import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewSkeletonSwap, {
    resolveReviewSkeletonSwapMode,
} from "./ReviewSkeletonSwap";

vi.mock("framer-motion", () => ({
    AnimatePresence: ({
        children,
    }: {
        children: React.ReactNode;
    }) => <>{children}</>,
    motion: {
        div: ({
            children,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            ...props
        }: React.HTMLAttributes<HTMLDivElement> & {
            children?: React.ReactNode;
            initial?: unknown;
            animate?: unknown;
            exit?: unknown;
            transition?: unknown;
        }) => <div {...props}>{children}</div>,
    },
}));

vi.mock(
    "@/components/review/module/ReviewModuleSkeleton",
    () => ({
        default: () => (
            <div data-testid="initial-review-skeleton" />
        ),
    }),
);

function render(args: {
    showSkeleton: boolean;
    holdContent: boolean;
}) {
    return renderToStaticMarkup(
        <ReviewSkeletonSwap
            showSkeleton={args.showSkeleton}
            holdContent={args.holdContent}
            reduceMotion
            leftCollapsed={false}
            rightCollapsed={false}
            leftW={280}
            rightW={420}
        >
            <div data-testid="review-content">
                Lesson
            </div>
        </ReviewSkeletonSwap>,
    );
}

describe("ReviewSkeletonSwap lightweight navigation", () => {
    it("keeps Review content mounted without a module-wide veil", () => {
        const html = render({
            showSkeleton: false,
            holdContent: true,
        });

        expect(html).toContain(
            'data-testid="review-content"',
        );
        expect(html).toContain(
            'data-review-transition-content="mounted"',
        );
        expect(html).toContain(
            'data-review-transition-content-held="true"',
        );
        expect(html).not.toContain(
            'data-testid="initial-review-skeleton"',
        );
    });

    it("does not switch to a full skeleton during same-module navigation", () => {
        const html = render({
            showSkeleton: true,
            holdContent: true,
        });

        expect(html).toContain(
            'data-testid="review-content"',
        );
        expect(html).toContain(
            'data-review-transition-content-held="true"',
        );
        expect(html).not.toContain(
            'data-testid="initial-review-skeleton"',
        );
    });

    it("releases held content after destination readiness", () => {
        const html = render({
            showSkeleton: false,
            holdContent: false,
        });

        expect(html).toContain(
            'data-testid="review-content"',
        );
        expect(html).not.toContain(
            'data-review-transition-content-held="true"',
        );
    });

    it("still uses the full skeleton for initial hydration", () => {
        const html = render({
            showSkeleton: true,
            holdContent: false,
        });

        expect(html).toContain(
            'data-testid="initial-review-skeleton"',
        );
        expect(html).not.toContain(
            'data-testid="review-content"',
        );
    });
    it("never returns to the full skeleton after Review content has mounted", () => {
        expect(
            resolveReviewSkeletonSwapMode({
                showSkeleton: true,
                holdContent: false,
                hasMountedContent: true,
            }),
        ).toBe("content");
    });

    it("still reserves the full skeleton for true initial hydration", () => {
        expect(
            resolveReviewSkeletonSwapMode({
                showSkeleton: true,
                holdContent: false,
                hasMountedContent: false,
            }),
        ).toBe("initial-skeleton");
    });

    it("keeps content when navigation itself is holding the surface", () => {
        expect(
            resolveReviewSkeletonSwapMode({
                showSkeleton: true,
                holdContent: true,
                hasMountedContent: false,
            }),
        ).toBe("content");
    });

});
