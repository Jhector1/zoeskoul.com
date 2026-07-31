"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export default function MobileDrawer(props: {
    open: boolean;
    side: "left" | "right";
    title: string;
    reduceMotion: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { open, side, title, reduceMotion, onClose, children } = props;

    return (
        <AnimatePresence>
            {open ? (
                <>
                    <motion.button
                        type="button"
                        aria-label="Close drawer"
                        className="ui-review-drawer-backdrop"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    />

                    <motion.aside
                        className={cn(
                            "ui-review-mobile-drawer",
                            side === "left" ? "left-0 rounded-r-2xl" : "right-0 rounded-l-2xl",
                        )}
                        initial={{ x: side === "left" ? -24 : 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: side === "left" ? -24 : 24, opacity: 0 }}
                        transition={{
                            duration: reduceMotion ? 0 : 0.2,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                    >
                        <div className="h-full min-h-0 flex flex-col">
                            <div className="ui-review-mobile-drawer-header">
                                <div className="ui-title-sm">
                                    {title}
                                </div>
                                <button
                                    type="button"
                                    className="ui-btn-secondary"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">{children}</div>
                        </div>
                    </motion.aside>
                </>
            ) : null}
        </AnimatePresence>
    );
}