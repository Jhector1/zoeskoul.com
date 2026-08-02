import React from "react";
import {
    renderToStaticMarkup,
} from "react-dom/server";
import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import ReviewModuleLayout from "./ReviewModuleLayout";

const captured = vi.hoisted(() => ({
    holdContent: [] as boolean[],
}));

vi.mock("../overlays/ReviewSkeletonSwap", () => ({
    default: ({
        children,
        holdContent,
    }: {
        children: React.ReactNode;
        holdContent?: boolean;
    }) => {
        captured.holdContent.push(
            Boolean(holdContent),
        );
        return <>{children}</>;
    },
}));

function capture(isNavigating: boolean) {
    captured.holdContent.length = 0;

    renderToStaticMarkup(
        <ReviewModuleLayout
            ariaBusy={isNavigating}
            reduceMotion
            showMask={isNavigating}
            showSkeleton={false}
            isNavigating={isNavigating}
            navigationLabel="Loading..."
            leftCollapsed
            rightCollapsed
            leftW={280}
            rightW={420}
            header={<div>Header</div>}
            body={<main>Lesson</main>}
        />,
    );

    return captured.holdContent.at(-1);
}

describe("ReviewModuleLayout transition content ownership", () => {
    it("holds content for the full navigation lifecycle", () => {
        expect(capture(true)).toBe(true);
    });

    it("releases content outside navigation", () => {
        expect(capture(false)).toBe(false);
    });
});
