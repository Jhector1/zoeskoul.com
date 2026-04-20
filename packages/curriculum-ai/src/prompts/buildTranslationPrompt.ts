export function buildTranslationPrompt(args: {
    sourceLocale: "en";
    targetLocale: string;
    messages: Record<string, unknown>;
}) {
    return {
        system:
            "Translate values only. Preserve JSON shape, placeholders, keys, code blocks, and protected tokens.",
        user: JSON.stringify(args),
    };
}