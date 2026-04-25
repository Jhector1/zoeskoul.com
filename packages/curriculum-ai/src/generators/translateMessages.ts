// packages/curriculum-ai/src/generators/translateMessages.ts

import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import type { AiProvider, TranslatedEntries } from "../types.js";
import { buildTranslationPrompt } from "../prompts/buildTranslationPrompt.js";

type JsonObject = Record<string, unknown>;

type FlatEntry = {
    key: string;
    value: string;
};

function isPlainObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodePathSegment(segment: string): string {
    return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function decodePathSegment(segment: string): string {
    return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function pathToKey(path: string[]): string {
    return `/${path.map(encodePathSegment).join("/")}`;
}

function keyToPath(key: string): string[] {
    const trimmed = key.startsWith("/") ? key.slice(1) : key;
    if (!trimmed) return [];

    return trimmed.split("/").map(decodePathSegment);
}

function flattenStringLeaves(value: unknown, path: string[] = []): FlatEntry[] {
    if (typeof value === "string") {
        return value.trim()
            ? [
                {
                    key: pathToKey(path),
                    value,
                },
            ]
            : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item, index) =>
            flattenStringLeaves(item, [...path, String(index)]),
        );
    }

    if (isPlainObject(value)) {
        return Object.entries(value).flatMap(([key, child]) =>
            flattenStringLeaves(child, [...path, key]),
        );
    }

    return [];
}

function cloneStructureWithoutStrings(value: unknown): unknown {
    if (typeof value === "string") return value;

    if (Array.isArray(value)) {
        return value.map((item) => cloneStructureWithoutStrings(item));
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                key,
                cloneStructureWithoutStrings(child),
            ]),
        );
    }

    return value;
}

function setAtPath(root: unknown, path: string[], value: string): unknown {
    if (path.length === 0) return value;

    let current = root as JsonObject | unknown[];

    for (let i = 0; i < path.length; i += 1) {
        const segment = path[i];
        const isLast = i === path.length - 1;

        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index) || index < 0) {
                throw new Error(`Invalid translation array path segment: ${segment}`);
            }

            if (isLast) {
                current[index] = value;
            } else {
                const next = current[index];
                if (!next || typeof next !== "object") {
                    current[index] = /^\d+$/.test(path[i + 1]) ? [] : {};
                }
                current = current[index] as JsonObject | unknown[];
            }

            continue;
        }

        const object = current as JsonObject;

        if (isLast) {
            object[segment] = value;
        } else {
            const next = object[segment];
            if (!next || typeof next !== "object") {
                object[segment] = /^\d+$/.test(path[i + 1]) ? [] : {};
            }
            current = object[segment] as JsonObject | unknown[];
        }
    }

    return root;
}

function rebuildTranslatedMessages(args: {
    sourceMessages: JsonObject;
    translatedEntries: FlatEntry[];
}): JsonObject {
    const rebuilt = cloneStructureWithoutStrings(args.sourceMessages) as JsonObject;

    for (const entry of args.translatedEntries) {
        const path = keyToPath(entry.key);
        setAtPath(rebuilt, path, entry.value);
    }

    return rebuilt;
}

function assertTranslationCompleteness(args: {
    sourceEntries: FlatEntry[];
    translatedEntries: FlatEntry[];
    locale: string;
}) {
    const sourceKeys = new Set(args.sourceEntries.map((entry) => entry.key));
    const translatedKeys = new Set(args.translatedEntries.map((entry) => entry.key));

    const missing = [...sourceKeys].filter((key) => !translatedKeys.has(key));
    const extra = [...translatedKeys].filter((key) => !sourceKeys.has(key));

    if (missing.length > 0 || extra.length > 0) {
        throw new Error(
            [
                `Translation key mismatch for locale "${args.locale}".`,
                missing.length > 0
                    ? `Missing keys: ${missing.slice(0, 20).join(", ")}`
                    : "",
                extra.length > 0
                    ? `Extra keys: ${extra.slice(0, 20).join(", ")}`
                    : "",
            ]
                .filter(Boolean)
                .join("\n"),
        );
    }
}

export async function translateMessages(
    provider: AiProvider,
    args: {
        shape: SubjectShapePack;
        sourceLocale: string;
        locale: string;
        sourceMessages: Record<string, unknown>;
    },
): Promise<Record<string, unknown>> {
    const entries = flattenStringLeaves(args.sourceMessages);

    if (entries.length === 0) {
        throw new Error(
            [
                `No translatable string entries found for locale "${args.locale}".`,
                "This usually means sourceMessages is empty or the message builder returned no string leaves.",
            ].join("\n"),
        );
    }

    const prompt = buildTranslationPrompt({
        locale: args.locale,
        sourceLocale: args.sourceLocale,
        entries,
        shape: args.shape,
    });

    const translated = await provider.generateJson<TranslatedEntries>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TranslatedEntries",
    });

    const translatedEntries = translated.entries.map((entry) => ({
        key: String(entry.key),
        value: String(entry.value),
    }));

    assertTranslationCompleteness({
        sourceEntries: entries,
        translatedEntries,
        locale: args.locale,
    });

    return rebuildTranslatedMessages({
        sourceMessages: args.sourceMessages,
        translatedEntries,
    });
}