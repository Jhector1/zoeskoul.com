"use client";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import { normalizeMath } from "@/lib/markdown/normalizeMath";
import React from "react";
import type { Exercise } from "@/lib/practice/types";
import { useTaggedT } from "@/i18n/tagged";

const BARE_I18N_KEY_RE = /^[a-zA-Z0-9_.:-]+$/;

function looksLikeBareI18nKey(value: string) {
    const trimmed = value.trim();

    return (
        trimmed.length > 0 &&
        trimmed.includes(".") &&
        !trimmed.includes(" ") &&
        BARE_I18N_KEY_RE.test(trimmed)
    );
}

export function ExercisePrompt({ exercise }: { exercise: Exercise | any }) {
    const tagged = useTaggedT();

    if (!exercise?.prompt) return null;

    const rawPrompt = String(exercise.prompt);
    const taggedResolved = tagged.resolve(rawPrompt, {}, rawPrompt);
    const resolvedPrompt =
        taggedResolved !== rawPrompt
            ? taggedResolved
            : looksLikeBareI18nKey(rawPrompt)
                ? String(tagged.raw(rawPrompt, rawPrompt))
                : rawPrompt;

    return (
        <MathMarkdown
            className={[
                "text-sm ui-text-muted",
                "[&_.katex]:text-[rgb(var(--ui-text)/0.96)]",
                "[&_.katex-display]:overflow-x-auto",
                "[&_.katex-display]:py-2",
            ].join(" ")}
            content={normalizeMath(resolvedPrompt)}
        />
    );
}
