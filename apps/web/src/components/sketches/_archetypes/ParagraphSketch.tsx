"use client";

import React from "react";
import RichMarkdownContent from "@/components/sketches/shared/RichMarkdownContent";
import {ParagraphSpec} from "@/components/sketches/subjects/specTypes";
import MathMarkdown from "@/components/markdown/MathMarkdown";

export function ParagraphSketch({
    spec,
    showTitle = true,
}: {
    spec: ParagraphSpec;
    showTitle?: boolean;
}) {
    const md = (spec.bodyMarkdown ?? spec.text ?? "").trim();
    const hasVisibleTitle = Boolean(showTitle && spec.title);

    return (
        <div>
            {hasVisibleTitle ? (
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                    {spec.title}
                </div>
            ) : null}

            <RichMarkdownContent
                content={md}
                images={spec.images}
                className={hasVisibleTitle ? "mt-2" : undefined}
                renderMarkdown={(content, key) => (
                    <MathMarkdown key={key} content={content} />
                )}
                emptyFallback={<span className="opacity-60">No text.</span>}
            />
        </div>
    );
}