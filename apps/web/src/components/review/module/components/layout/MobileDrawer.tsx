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
                        className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    />

                    <motion.aside
                        className={cn(
                            "fixed top-0 bottom-0 z-[100] w-[min(92vw,380px)]",
                            "bg-white/85 backdrop-blur border border-neutral-200/70",
                            "dark:bg-[#0b0d12]/85 dark:border-white/10",
                            "shadow-2xl",
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
                            <div className="shrink-0 flex items-center justify-between gap-2 p-3">
                                <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                                    {title}
                                </div>
                                <button
                                    type="button"
                                    className="ui-btn ui-btn-secondary text-xs font-extrabold"
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