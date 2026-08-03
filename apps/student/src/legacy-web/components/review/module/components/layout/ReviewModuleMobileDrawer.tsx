"use client";

import React from "react";
import MobileDrawer from "../../components/layout/MobileDrawer";
import ModuleSidebar from "../../components/ModuleSidebar";

type Props = {
    open: boolean;
    reduceMotion: boolean;
    onClose: () => void;
    padStyle: React.CSSProperties;
    sidebarProps: React.ComponentProps<typeof ModuleSidebar>;
};

export default function ReviewModuleMobileDrawer({
                                                     open,
                                                     reduceMotion,
                                                     onClose,
                                                     padStyle,
                                                     sidebarProps,
                                                 }: Props) {
    return (
        <MobileDrawer
            open={open}
            side="left"
            title="Topics"
            reduceMotion={reduceMotion}
            onClose={onClose}
        >
            <div className="p-3" style={padStyle}>
                <ModuleSidebar {...sidebarProps} />
            </div>
        </MobileDrawer>
    );
}