"use client";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import { normalizeMath } from "@/lib/markdown/normalizeMath";
import React from "react";
import type { Exercise } from "@/lib/practice/types";

export function ExercisePrompt({ exercise }: { exercise: Exercise | any }) {
    if (!exercise?.prompt) return null;

    return (
        <MathMarkdown
            className={[
                "text-sm ui-text-muted",
                "[&_.katex]:text-[rgb(var(--ui-text)/0.96)]",
                "[&_.katex-display]:overflow-x-auto",
                "[&_.katex-display]:py-2",
            ].join(" ")}
            content={normalizeMath(String(exercise.prompt))}
        />
    );
}