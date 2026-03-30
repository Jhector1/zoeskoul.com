"use client";

import React from "react";

export default function BillingShell({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="relative min-h-screen p-4 md:p-6"
            style={{
                backgroundColor: "rgb(var(--ui-bg) / 1)",
                color: "rgb(var(--ui-text) / 1)",
            }}
        >
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.8) 1px, transparent 0)",
                        backgroundSize: "18px 18px",
                    }}
                />
            </div>

            <div className="relative">{children}</div>
        </div>
    );
}