"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cx } from "./utils/cx";
import type { ToolId, ToolsCtx } from "./types";
import { TOOL_SPECS } from "./registry";

function getToolLabel(id: ToolId, t: ReturnType<typeof useTranslations>) {
    if (id === "code") return t("run");
    if (id === "notes") return t("notes");
    return id;
}

export default function ToolTabs(props: {
    ctx: ToolsCtx;
    value: ToolId;
    onChange: (v: ToolId) => void;
}) {
    const { ctx, value, onChange } = props;
    const t = useTranslations("ide.tools.tabs");

    return (
        <div className="flex rounded-xl border border-neutral-200 overflow-hidden dark:border-white/10">
            {TOOL_SPECS.map((spec) => {
                const disabled = !spec.enabled(ctx);
                const active = value === spec.id;
                const Icon = spec.Icon;
                const label = getToolLabel(spec.id, t);

                return (
                    <button
                        key={spec.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(spec.id)}
                        title={disabled ? t("disabledForSubject", { label }) : label}
                        className={cx(
                            "px-2.5 py-2 text-[11px] font-extrabold inline-flex items-center gap-1.5",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            active
                                ? "bg-neutral-900 text-white dark:bg-white/90 dark:text-black"
                                : "bg-transparent text-neutral-700 dark:text-white/70"
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
