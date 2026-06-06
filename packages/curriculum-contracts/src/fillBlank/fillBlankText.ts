const BRACKET_BLANK_PATTERN = /\[blank\d*\]/gi;
const UNDERSCORE_BLANK_PATTERN = /_{2,}/g;

export type FillBlankReplacement = string | (() => string);

export function isIdentifierChar(value: string | undefined): boolean {
    return typeof value === "string" && /^[A-Za-z0-9_]$/.test(value);
}

export function countBracketBlanks(value: string): number {
    return (String(value ?? "").match(BRACKET_BLANK_PATTERN) ?? []).length;
}

export function countStandaloneUnderscoreBlanks(value: string): number {
    const text = String(value ?? "");
    let count = 0;

    for (const match of text.matchAll(UNDERSCORE_BLANK_PATTERN)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const before = start > 0 ? text[start - 1] : undefined;
        const after = end < text.length ? text[end] : undefined;

        // Count visible blanks like ___.
        // Ignore Python identifier/dunder names like __init__, __str__, __dict__.
        if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
            count += 1;
        }
    }

    return count;
}

export function replaceStandaloneUnderscoreBlanks(
    value: string,
    replacement: FillBlankReplacement,
): string {
    const text = String(value ?? "");

    return text.replace(UNDERSCORE_BLANK_PATTERN, (match: string, offset: number) => {
        const start = offset;
        const end = start + match.length;
        const before = start > 0 ? text[start - 1] : undefined;
        const after = end < text.length ? text[end] : undefined;

        // Preserve Python identifier/dunder names.
        if (isIdentifierChar(before) || isIdentifierChar(after)) {
            return match;
        }

        return typeof replacement === "function" ? replacement() : replacement;
    });
}

export function countFillBlanks(template: string, prompt: string): number {
    const normalizedTemplate = String(template ?? "");
    const normalizedPrompt = String(prompt ?? "");

    return (
        countBracketBlanks(normalizedTemplate) +
        countStandaloneUnderscoreBlanks(normalizedTemplate) +
        countStandaloneUnderscoreBlanks(normalizedPrompt)
    );
}