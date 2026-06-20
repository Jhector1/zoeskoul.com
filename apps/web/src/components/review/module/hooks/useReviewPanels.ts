import { useCallback, useEffect, useMemo, useState } from "react";
import { useResizablePanels } from "./useResizablePanels";
import { useMediaQuery } from "./useMediaQuery";

type Args = {
    footerInsetPx?: number;
};

export function useReviewPanels({ footerInsetPx = 0 }: Args) {
    const panels = useResizablePanels();

    const mdUp = useMediaQuery("(min-width: 768px)");
    const lgUp = useMediaQuery("(min-width: 1024px)");
    const xlUp = useMediaQuery("(min-width: 1280px)");

    const showDesktopLeft = xlUp;
    const toolsUiEnabled = true;
    const showDesktopRight = xlUp;

    const [mobileTopicsOpen, setMobileTopicsOpen] = useState(false);

    useEffect(() => {
        if (mdUp) setMobileTopicsOpen(false);
    }, [mdUp]);

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
            panels.setLeftCollapsed(false);
            return;
        }

        setMobileTopicsOpen(true);
    }, [showDesktopLeft, panels]);

    const handleToggleRightPanel = useCallback(() => {
        panels.setRightCollapsed((v) => !v);
    }, [panels]);

    const handleCollapseLeft = useCallback(() => {
        panels.setLeftCollapsed(true);
    }, [panels]);

    const handleCollapseRight = useCallback(() => {
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
