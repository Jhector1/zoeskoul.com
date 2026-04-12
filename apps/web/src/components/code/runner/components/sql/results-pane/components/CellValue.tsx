
import React from "react";

export function CellValue({ value }: { value: unknown }) {
    if (value == null) {
        return (
            <span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
        NULL
      </span>
        );
    }

    if (typeof value === "boolean") {
        return <span>{value ? "true" : "false"}</span>;
    }

    return <span>{String(value)}</span>;
}
