import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResizablePanels } from "./useResizablePanels";
import { useMediaQuery } from "./useMediaQuery";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

type Args = {
    footerInsetPx?: number;
    shouldDefaultCollapseRightRail?: boolean;
    rightRailDefaultScopeKey?: string;
    allowDesktopRightRail?: boolean;
};

export function shouldDefaultCollapseReviewSidebar(args: {
    compactLearnerUi: boolean;
    showDebugLearningUi: boolean;
    showDesktopLeft: boolean;
    wideDesktopUp: boolean;
}) {
    return (
        args.compactLearnerUi &&
        !args.showDebugLearningUi &&
        args.showDesktopLeft &&
        !args.wideDesktopUp
    );
}

export function shouldResetManualPanelChoice(
    previousScopeKey?: string | null,
    nextScopeKey?: string | null,
) {
    return (previousScopeKey ?? "") !== (nextScopeKey ?? "");
}

export function useReviewPanels({
    footerInsetPx = 0,
    shouldDefaultCollapseRightRail = false,
    rightRailDefaultScopeKey,
    allowDesktopRightRail = true,
}: Args) {
    const panels = useResizablePanels();

    const mdUp = useMediaQuery("(min-width: 768px)");
    const lgUp = useMediaQuery("(min-width: 1024px)");
    const xlUp = useMediaQuery("(min-width: 1280px)");
    const wideDesktopUp = useMediaQuery("(min-width: 1400px)");

    const showDesktopLeft = xlUp;
    const toolsUiEnabled = true;
    const showDesktopRight = xlUp && allowDesktopRightRail;
    const shouldDefaultCollapseSidebar = shouldDefaultCollapseReviewSidebar({
        compactLearnerUi: learnerUiFlags.compactLearnerUi,
        showDebugLearningUi: learnerUiFlags.showDebugLearningUi,
        showDesktopLeft,
        wideDesktopUp,
    });

    const [mobileTopicsOpen, setMobileTopicsOpen] = useState(false);
    const leftSidebarChoiceTouchedRef = useRef(false);
    const rightRailChoiceTouchedRef = useRef(false);
    const previousRightRailDefaultScopeKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (mdUp) setMobileTopicsOpen(false);
    }, [mdUp]);

    useEffect(() => {
        const previousScopeKey = previousRightRailDefaultScopeKeyRef.current;
        const nextScopeKey = rightRailDefaultScopeKey ?? null;

        if (!shouldResetManualPanelChoice(previousScopeKey, nextScopeKey)) {
            return;
        }

        previousRightRailDefaultScopeKeyRef.current = nextScopeKey;
        rightRailChoiceTouchedRef.current = false;
    }, [rightRailDefaultScopeKey]);

    useEffect(() => {
        if (!showDesktopLeft) return;
        if (leftSidebarChoiceTouchedRef.current) return;

        panels.setLeftCollapsed(shouldDefaultCollapseSidebar);
    }, [panels, showDesktopLeft, shouldDefaultCollapseSidebar]);

    useEffect(() => {
        if (!showDesktopRight) return;
        if (rightRailChoiceTouchedRef.current) return;

        panels.setRightCollapsed(shouldDefaultCollapseRightRail);
    }, [panels, showDesktopRight, shouldDefaultCollapseRightRail]);

    const leftCollapsedEff = showDesktopLeft ? panels.leftCollapsed : true;
    const rightCollapsedEff = showDesktopRight ? panels.rightCollapsed : true;

    const footerPad = footerInsetPx ? footerInsetPx + 12 : 0;

    const padStyle = useMemo(
        () =>
            ({
                paddingBottom: undefined,
                scrollPaddingBottom: footerPad || undefined,
                ["--flow-bottom-inset" as any]: `${footerPad || 0}px`,
            }) as React.CSSProperties,
        [footerPad],
    );

    const handleToggleLeftPanel = useCallback(() => {
        /**
         * This button is labeled "Topics", so it should behave like "show topics".
         *
         * Root cause:
         * Review-practice E2E calls:
         *
         *   page.getByRole("button", { name: /Topics/i }).click()
         *   page.getByText(/Read before coding/i).click()
         *
         * On desktop the sidebar is already open. If this button toggles closed,
         * "Read before coding" becomes hidden and Playwright waits until the test
         * timeout before the optional .catch() runs.
         *
         * Keep this action idempotent/open-only. The sidebar still has its own
         * dedicated collapse button, wired through handleCollapseLeft.
         */
        if (showDesktopLeft) {
            leftSidebarChoiceTouchedRef.current = true;
            panels.setLeftCollapsed(false);
            return;
        }

        setMobileTopicsOpen(true);
    }, [showDesktopLeft, panels]);

    const handleToggleRightPanel = useCallback(() => {
        rightRailChoiceTouchedRef.current = true;
        panels.setRightCollapsed((v) => !v);
    }, [panels]);

    const handleCollapseLeft = useCallback(() => {
        leftSidebarChoiceTouchedRef.current = true;
        panels.setLeftCollapsed(true);
    }, [panels]);

    const handleCollapseRight = useCallback(() => {
        rightRailChoiceTouchedRef.current = true;
        panels.setRightCollapsed(true);
    }, [panels]);

    return {
        ...panels,
        mdUp,
        lgUp,
        xlUp,
        showDesktopLeft,
        toolsUiEnabled,
        showDesktopRight,
        mobileTopicsOpen,
        setMobileTopicsOpen,
        leftCollapsedEff,
        rightCollapsedEff,
        padStyle,
        handleToggleLeftPanel,
        handleToggleRightPanel,
        handleCollapseLeft,
        handleCollapseRight,
    };
}
