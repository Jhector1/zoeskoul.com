"use client";

import React, { useState } from "react";
import SpanBasisModule from "@/components/modules/SpanBasisModule";
import Module0VectorSimulatorP5Hybrid from "@/components/Module0VectorSimulatorP5Hybrid";
import type { Mode } from "@/lib/math/vec3";
import { useTranslations } from "next-intl";

type Tool = "span" | "module0";

function TabButton({
                       active,
                       children,
                       onClick,
                   }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={[
                "ui-navlink rounded-xl px-3 py-2 text-sm font-extrabold transition",
                active ? "ui-navlink--active bg-emerald-500/10 border border-emerald-600/25 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                    : "ui-navlink--inactive border border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.10]",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function SegButton({
                       active,
                       children,
                       onClick,
                   }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={[
                "px-3 py-1.5 text-sm font-extrabold transition",
                active
                    ? "bg-emerald-500/10 text-emerald-950 dark:bg-emerald-300/10 dark:text-white/90"
                    : "text-neutral-700 hover:text-neutral-950 dark:text-white/70 dark:hover:text-white/90",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

export default function LinearAlgebraSandbox() {
    const t = useTranslations("Playground");

    const [tool, setTool] = useState<Tool>("module0");
    const [mode, setMode] = useState<Mode>("2d");

    return (
        <div className="ui-container py-6">
            {/* Header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white">
                        {t("title")}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-white/60">
                        {t("subtitle")}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <TabButton active={tool === "span"} onClick={() => setTool("span")}>
                        {t("tabs.spanBasis")}
                    </TabButton>
                    <TabButton active={tool === "module0"} onClick={() => setTool("module0")}>
                        {t("tabs.module0")}
                    </TabButton>
                </div>
            </div>

            {/* Mode bar */}
            <div className="ui-card mb-4 p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold text-neutral-700 dark:text-white/70">
                        {t("viewMode")}{" "}
                        <span className="text-neutral-900 dark:text-white">
              {mode.toUpperCase()}
            </span>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex">
                            <SegButton active={mode === "2d"} onClick={() => setMode("2d")}>
                                {t("mode.2d")}
                            </SegButton>
                            <SegButton active={mode === "3d"} onClick={() => setMode("3d")}>
                                {t("mode.3d")}
                            </SegButton>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tool */}
            {tool === "span" ? <SpanBasisModule mode={mode} /> : <Module0VectorSimulatorP5Hybrid mode={mode} />}
        </div>
    );
}
