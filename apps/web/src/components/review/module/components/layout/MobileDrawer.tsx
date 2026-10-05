"use client";

import React from "react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";

export default function MobileDrawer(props: {
    open: boolean;
    side: "left" | "right";
    title: string;
    reduceMotion: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { open, side, title, reduceMotion, onClose, children } = props;
    const durationClass = reduceMotion ? "duration-0" : "duration-150";

    return (
        <>
            <button
                type="button"
                aria-label="Close drawer"
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                className={cn(
                    "ui-review-drawer-backdrop transition-opacity",
                    durationClass,
                    open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                )}
                onClick={onClose}
            />

            <aside
                aria-hidden={!open}
                className={cn(
                    "ui-review-mobile-drawer transition-[transform,opacity,visibility]",
                    durationClass,
                    side === "left" ? "left-0 rounded-r-2xl" : "right-0 rounded-l-2xl",
                    open
                        ? "visible translate-x-0 opacity-100"
                        : side === "left"
                            ? "invisible pointer-events-none -translate-x-3 opacity-0"
                            : "invisible pointer-events-none translate-x-3 opacity-0",
                )}
            >
                <div className="h-full min-h-0 flex flex-col">
                    <div className="ui-review-mobile-drawer-header">
                        <div className="ui-title-sm">{title}</div>
                        <button
                            type="button"
                            className="ui-btn-secondary"
                            onClick={onClose}
                            tabIndex={open ? 0 : -1}
                        >
                            Close
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">{children}</div>
                </div>
            </aside>
        </>
    );
}
