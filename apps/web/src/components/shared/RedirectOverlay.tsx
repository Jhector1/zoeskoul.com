"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Languages, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

type RedirectOverlayProps = {
    open: boolean;
    mode?: "trial" | "locale";
    title: string;
    description?: string;
    statusLabel?: string;
};

export default function RedirectOverlay({
                                            open,
                                            mode = "trial",
                                            title,
                                            description,
                                            statusLabel,
                                        }: RedirectOverlayProps) {
    const Icon = mode === "locale" ? Languages : Sparkles;

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-white/78 backdrop-blur-xl dark:bg-black/72"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.22 }}
                        className="mx-auto w-full max-w-[420px] px-4"
                    >
                        <div
                            className={cn(
                                "rounded-[24px] border p-5 sm:p-6",
                                "bg-white/88 border-black/5 shadow-[0_24px_80px_-28px_rgba(0,0,0,0.28)]",
                                "dark:bg-white/[0.06] dark:border-white/10 dark:shadow-none",
                            )}
                        >
                            <div className="flex flex-col items-center text-center">
                                <div className="relative">
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-emerald-300/20 blur-2xl dark:bg-emerald-300/10"
                                        animate={{
                                            scale: [1, 1.08, 1],
                                            opacity: [0.45, 0.85, 0.45],
                                        }}
                                        transition={{
                                            duration: 2.2,
                                            repeat: Infinity,
                                            ease: "easeInOut",
                                        }}
                                    />

                                    <div className="relative flex h-[78px] w-[78px] items-center justify-center rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
                                        <Icon className="size-7" />
                                    </div>

                                    <motion.div
                                        className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/12 backdrop-blur-md dark:border-emerald-300/20 dark:bg-emerald-300/12"
                                        animate={{ rotate: 360 }}
                                        transition={{
                                            duration: 1.1,
                                            repeat: Infinity,
                                            ease: "linear",
                                        }}
                                    >
                                        <div className="size-3 rounded-full border-2 border-emerald-600 border-t-transparent dark:border-emerald-300 dark:border-t-transparent" />
                                    </motion.div>
                                </div>

                                <div className="mt-5 max-w-[300px]">
                                    <div className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                                        {title}
                                    </div>

                                    {description ? (
                                        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/65">
                                            {description}
                                        </p>
                                    ) : null}

                                    {statusLabel ? (
                                        <div className="mt-3 inline-flex rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
                                            {statusLabel}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-5 flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-white/50">
                                    <motion.span
                                        className="inline-block size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300"
                                        animate={{ opacity: [0.25, 1, 0.25] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                                    />
                                    <motion.span
                                        className="inline-block size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300"
                                        animate={{ opacity: [0.25, 1, 0.25] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                                    />
                                    <motion.span
                                        className="inline-block size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300"
                                        animate={{ opacity: [0.25, 1, 0.25] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}