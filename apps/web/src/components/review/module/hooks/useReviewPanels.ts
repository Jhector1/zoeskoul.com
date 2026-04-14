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

    const showDesktopLeft = mdUp;
    const TOOLS_DESKTOP_ONLY = true;
    const toolsUiEnabled = TOOLS_DESKTOP_ONLY ? lgUp : mdUp;
    const showDesktopRight = toolsUiEnabled;

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
        if (showDesktopLeft) panels.setLeftCollapsed((v) => !v);
        else setMobileTopicsOpen(true);
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