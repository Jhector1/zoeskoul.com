"use client";

import React from "react";
import { cx } from "./utils/cx";
import type { ToolId, ToolsCtx } from "./types";
import { TOOL_SPECS } from "./registry";

export default function ToolTabs(props: {
    ctx: ToolsCtx;
    value: ToolId;
    onChange: (v: ToolId) => void;
}) {
    const { ctx, value, onChange } = props;

    return (
        <div className="flex rounded-xl border border-neutral-200 overflow-hidden dark:border-white/10">
            {TOOL_SPECS.map((t) => {
                const disabled = !t.enabled(ctx);
                const active = value === t.id;
                const Icon = t.Icon;

                return (
                    <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(t.id)}
                        title={disabled ? `${t.label} disabled for this subject` : t.label}
                        className={cx(
                            "px-2.5 py-2 text-[11px] font-extrabold inline-flex items-center gap-1.5",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            active
                                ? "bg-neutral-900 text-white dark:bg-white/90 dark:text-black"
                                : "bg-transparent text-neutral-700 dark:text-white/70"
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}