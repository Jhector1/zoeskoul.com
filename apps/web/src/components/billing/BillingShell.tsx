"use client";

import React from "react";

export default function BillingShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen p-4 md:p-6 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
            {/* homepage-style glow */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="absolute top-[28%] right-[-140px] h-[460px] w-[460px] rounded-full bg-indigo-400/10 blur-3xl" />
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.9)_1px,transparent_0)] [background-size:18px_18px]" />
            </div>

            <div className="relative">{children}</div>
        </div>
    );
}