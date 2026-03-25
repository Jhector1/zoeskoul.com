"use client";

import React from "react";
import TextMarkdown from "@/components/markdown/TextMarkdown";
import { cn } from "@/components/sketches/_shared/sketchUi";

export default function ComingSoonSketch(props: {
    title?: string;
    description?: string;
    planned?: string[];
    // SketchBlock passes these for custom entries — keep compatibility
    spec?: any;
    value?: any;
    onChange?: (s: any) => void;
    readOnly?: boolean;
    height?: number;
}) {
    const title = props.title ?? "Coming soon";
    const description =
        props.description ??
        "This archetype is registered in the gallery, but the renderer isn’t implemented yet.";

    return (
        <div className="ui-sketch-panel">
            <div className="text-lg font-black text-neutral-900 dark:text-white">
                {title}
            </div>

            <div className="mt-2 text-sm text-neutral-700 dark:text-white/70">
                {description}
            </div>

            {props.planned?.length ? (
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="text-xs font-black text-neutral-600 dark:text-white/60">
                        Planned behavior
                    </div>
                    <ul className="mt-2 grid gap-1 text-sm text-neutral-700 dark:text-white/70">
                        {props.planned.map((x) => (
                            <li key={x} className="flex gap-2">
                                <span className="mt-[2px]">•</span>
                                <span>{x}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className={cn("mt-4 rounded-xl border p-3 text-xs font-extrabold",
                "border-amber-500/30 bg-amber-400/10 text-amber-900",
                "dark:border-amber-300/25 dark:bg-amber-200/10 dark:text-amber-200"
            )}>
                Tip: Once you implement the archetype renderer, swap this custom entry to{" "}
                <span className="font-mono">kind: "archetype"</span>.
            </div>
        </div>
    );
}
