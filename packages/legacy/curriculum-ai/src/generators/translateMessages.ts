import type {
    AiProvider,
    TranslationEntriesPayload,
    TranslationEntry,
} from "../types.js";
import { buildTranslationPrompt } from "../prompts/buildTranslationPrompt.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function flattenMessages(
    value: unknown,
    prefix = "",
    out: TranslationEntry[] = [],
): TranslationEntry[] {
    if (typeof value === "string") {
        out.push({ key: prefix, value });
        return out;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            const next = prefix ? `${prefix}.${index}` : String(index);
            flattenMessages(item, next, out);
        });
        return out;
    }

    if (isPlainObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            const next = prefix ? `${prefix}.${key}` : key;
            flattenMessages(child, next, out);
        }
        return out;
    }

    out.push({ key: prefix, value: String(value ?? "") });
    return out;
}

function setDeep(target: Record<string, unknown>, path: string, value: string) {
    const parts = path.split(".");
    let cursor: any = target;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const nextPart = parts[i + 1];
        const nextIsIndex = nextPart != null && /^\d+$/.test(nextPart);

        if (isLast) {
            if (/^\d+$/.test(part)) {
                const index = Number(part);
                if (!Array.isArray(cursor)) {
                    throw new Error(`Invalid array assignment at path "${path}"`);
                }
                cursor[index] = value;
            } else {
                cursor[part] = value;
            }
            return;
        }

        if (/^\d+$/.test(part)) {
            const index = Number(part);
            if (!Array.isArray(cursor)) {
                throw new Error(`Invalid array traversal at path "${path}"`);
            }
            if (cursor[index] == null) {
                cursor[index] = nextIsIndex ? [] : {};
            }
            cursor = cursor[index];
            continue;
        }

        if (cursor[part] == null) {
            cursor[part] = nextIsIndex ? [] : {};
        }

        cursor = cursor[part];
    }
}

function unflattenEntries(entries: TranslationEntry[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const entry of entries) {
        if (!entry.key) continue;
        setDeep(out, entry.key, entry.value);
    }

    return out;
}

function validateTranslatedEntries(
    source: TranslationEntry[],
    translated: TranslationEntry[],
    locale: string,
) {
    if (translated.length !== source.length) {
        throw new Error(
            `Locale ${locale} returned ${translated.length} entries, expected ${source.length}`,
        );
    }

    for (let i = 0; i < source.length; i++) {
        const src = source[i];
        const tr = translated[i];

        if (!tr || tr.key !== src.key) {
            throw new Error(
                `Locale ${locale} changed key at index ${i}: expected "${src.key}", got "${tr?.key ?? "missing"}"`,
            );
        }
    }
}

export async function translateMessages(
    provider: AiProvider,
    args: {
        sourceLocale: "en";
        targetLocale: string;
        messages: Record<string, unknown>;
    },
): Promise<Record<string, unknown>> {
    const sourceEntries = flattenMessages(args.messages);

    const prompt = buildTranslationPrompt({
        sourceLocale: args.sourceLocale,
        targetLocale: args.targetLocale,
        entries: sourceEntries,
    });

    const translatedPayload = await provider.generateJson<TranslationEntriesPayload>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TranslatedEntries",
    });

    validateTranslatedEntries(
        sourceEntries,
        translatedPayload.entries,
        args.targetLocale,
    );

    return unflattenEntries(translatedPayload.entries);
}