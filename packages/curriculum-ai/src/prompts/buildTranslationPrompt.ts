import type { TranslationEntry } from "../types.js";

export function buildTranslationPrompt(args: {
    sourceLocale: "en";
    targetLocale: string;
    entries: TranslationEntry[];
}) {
    return {
        system: [
            "Translate values only.",
            "Return valid JSON only.",
            "Return an object with exactly one top-level key named 'entries'.",
            "Do not change any key.",
            "Do not add entries.",
            "Do not remove entries.",
            "Return the same number of entries in the same order.",
            "Each entry must keep the original key exactly.",
            "Only translate the value field.",
            "Preserve placeholders, inline code, code fences, variable names, and protected tokens.",
        ].join(" "),
        user: JSON.stringify(
            {
                task: "Translate entry list",
                sourceLocale: args.sourceLocale,
                targetLocale: args.targetLocale,
                entries: args.entries,
            },
            null,
            2,
        ),
    };
}