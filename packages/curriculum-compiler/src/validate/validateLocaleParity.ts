import { flattenMessageKeys } from "./validateMessages.js";

export function validateLocaleParity(
    source: Record<string, unknown>,
    translated: Record<string, unknown>,
    locale: string,
) {
    const sourceKeys = flattenMessageKeys(source);
    const translatedKeys = flattenMessageKeys(translated);

    const missing = sourceKeys.filter((k) => !translatedKeys.includes(k));
    if (missing.length) {
        throw new Error(`Locale ${locale} is missing keys: ${missing.join(", ")}`);
    }
}