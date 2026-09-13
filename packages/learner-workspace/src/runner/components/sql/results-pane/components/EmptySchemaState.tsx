
import React from "react";

export function EmptySchemaState(props: { title: string; subtitle: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-neutral-200/70 bg-white/90 p-6 dark:border-white/10 dark:bg-black/20">
            <div className="text-center">
                <div className="text-sm font-medium text-neutral-900 dark:text-white/90">
                    {props.title}
                </div>
                <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/50">
                    {props.subtitle}
                </div>
            </div>
        </div>
    );
}
