"use client";

import React from "react";
import RichMarkdownContent from "@/components/sketches/shared/RichMarkdownContent";
import {ParagraphSpec} from "@/components/sketches/subjects/specTypes";
import MathMarkdown from "@/components/markdown/MathMarkdown";

export function ParagraphSketch({ spec }: { spec: ParagraphSpec }) {
    const md = (spec.bodyMarkdown ?? spec.text ?? "").trim();

    return (
        <div>
            {spec.title ? (
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                    {spec.title}
                </div>
            ) : null}

            <RichMarkdownContent
                content={md}
                images={spec.images}
                className="mt-2"
                renderMarkdown={(content, key) => (
                    <MathMarkdown key={key} content={content} />
                )}
                emptyFallback={<span className="opacity-60">No text.</span>}
            />
        </div>
    );
}