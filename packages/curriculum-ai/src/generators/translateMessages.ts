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


type CodeCommentTask = {
    commentKey: string;
    lineIndex: number;
    start: number;
    text: string;
};

type CodeCommentPlan = {
    sourceKey: string;
    sourceValue: string;
    newline: string;
    lines: string[];
    tasks: CodeCommentTask[];
};

const CODE_COMMENT_SYNTHETIC_SEGMENT = "__zsCodeComment";

function isCodeTextEntryKey(key: string): boolean {
    const path = keyToPath(key);
    const last = path[path.length - 1]?.toLowerCase() ?? "";
    const joined = path.join("/").toLowerCase();

    return (
        last === "startercode" ||
        last === "solutioncode" ||
        last === "content" ||
        joined.includes("/starterfiles/") ||
        joined.includes("/solutionfiles/")
    );
}

function findLineCommentStart(line: string): number {
    let quote: '"' | "'" | "`" | null = null;
    let escaped = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (quote) {
            if (char === "\\") {
                escaped = true;
                continue;
            }

            if (char === quote) {
                quote = null;
            }

            continue;
        }

        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            continue;
        }

        if (char === "#" && next !== "!") return index;
        if (char === "/" && next === "/") return index;
        if (char === "-" && next === "-") return index;
    }

    return -1;
}

function getCommentPrefix(line: string, start: number): string {
    const marker = line.slice(start, start + 2);

    if (marker === "//" || marker === "--") {
        const afterMarker = line[start + 2] === " " ? " " : "";
        return line.slice(0, start + 2) + afterMarker;
    }

    const afterHash = line[start + 1] === " " ? " " : "";
    return line.slice(0, start + 1) + afterHash;
}

function getCommentText(line: string, start: number): string {
    const marker = line.slice(start, start + 2);

    if (marker === "//" || marker === "--") {
        return line.slice(start + 2).replace(/^\s/, "");
    }

    return line.slice(start + 1).replace(/^\s/, "");
}

function shouldTranslateCodeComment(text: string): boolean {
    const value = text.trim();

    if (!value) return false;
    if (value.startsWith("@:")) return false;
    if (/^noqa\b|^type:\s*ignore\b|^eslint\b|^prettier\b/i.test(value)) {
        return false;
    }
    if (/^(TODO|FIXME|NOTE)\s*:?$/i.test(value)) return false;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return false;

    return /[A-Za-z]/.test(value);
}

function extractCodeCommentPlan(entry: FlatEntry): CodeCommentPlan | null {
    if (!isCodeTextEntryKey(entry.key)) return null;
    if (!/[#]|\/\//.test(entry.value) && !/--/.test(entry.value)) return null;

    const newline = entry.value.includes("\r\n") ? "\r\n" : "\n";
    const lines = entry.value.split(/\r?\n/);
    const tasks: CodeCommentTask[] = [];

    lines.forEach((line, lineIndex) => {
        const start = findLineCommentStart(line);
        if (start < 0) return;

        const text = getCommentText(line, start);
        if (!shouldTranslateCodeComment(text)) return;

        tasks.push({
            commentKey: `${entry.key}/${CODE_COMMENT_SYNTHETIC_SEGMENT}/${tasks.length}`,
            lineIndex,
            start,
            text,
        });
    });

    if (tasks.length === 0) return null;

    return {
        sourceKey: entry.key,
        sourceValue: entry.value,
        newline,
        lines,
        tasks,
    };
}

function buildTranslationEntries(args: {
    sourceEntries: FlatEntry[];
}): {
    entriesForProvider: FlatEntry[];
    codeCommentPlans: CodeCommentPlan[];
} {
    const codeCommentPlans: CodeCommentPlan[] = [];
    const entriesForProvider: FlatEntry[] = [];

    for (const entry of args.sourceEntries) {
        const plan = extractCodeCommentPlan(entry);

        if (!plan) {
            entriesForProvider.push(entry);
            continue;
        }

        codeCommentPlans.push(plan);

        for (const task of plan.tasks) {
            entriesForProvider.push({
                key: task.commentKey,
                value: task.text,
            });
        }
    }

    return { entriesForProvider, codeCommentPlans };
}

function rebuildCodeEntryWithTranslatedComments(args: {
    plan: CodeCommentPlan;
    translatedByKey: Map<string, string>;
}): string {
    const lines = [...args.plan.lines];

    for (const task of args.plan.tasks) {
        const line = lines[task.lineIndex] ?? "";
        const prefix = getCommentPrefix(line, task.start);
        const translated = args.translatedByKey.get(task.commentKey)?.trim() || task.text;
        lines[task.lineIndex] = prefix + translated;
    }

    return lines.join(args.plan.newline);
}

function resolveTranslatedEntries(args: {
    sourceEntries: FlatEntry[];
    translatedEntries: FlatEntry[];
    codeCommentPlans: CodeCommentPlan[];
}): FlatEntry[] {
    const translatedByKey = new Map(
        args.translatedEntries.map((entry) => [entry.key, entry.value] as const),
    );
    const planBySourceKey = new Map(
        args.codeCommentPlans.map((plan) => [plan.sourceKey, plan] as const),
    );

    return args.sourceEntries.map((entry) => {
        const plan = planBySourceKey.get(entry.key);

        if (plan) {
            return {
                key: entry.key,
                value: rebuildCodeEntryWithTranslatedComments({
                    plan,
                    translatedByKey,
                }),
            };
        }

        return {
            key: entry.key,
            value: translatedByKey.get(entry.key) ?? entry.value,
        };
    });
}

function logCodeCommentTranslationDebug(plans: CodeCommentPlan[]) {
    if (
        process.env.DEEPL_DEBUG_CODE_COMMENTS !== "1" &&
        process.env.TRANSLATION_DEBUG_CODE_COMMENTS !== "1"
    ) {
        return;
    }

    const commentCount = plans.reduce((sum, plan) => sum + plan.tasks.length, 0);
    const sampleKeys = plans
        .slice(0, 8)
        .map((plan) => plan.sourceKey)
        .join(", ");

    console.log(`Translation code-comment entries: ${plans.length}`);
    console.log(`Translation code-comment segments: ${commentCount}`);
    if (sampleKeys) {
        console.log(`Translation code-comment sample keys: ${sampleKeys}`);
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
    const sourceEntries = flattenStringLeaves(args.sourceMessages);

    if (sourceEntries.length === 0) {
        throw new Error(
            [
                `No translatable string entries found for locale "${args.locale}".`,
                "This usually means sourceMessages is empty or the message builder returned no string leaves.",
            ].join("\n"),
        );
    }

    const { entriesForProvider, codeCommentPlans } = buildTranslationEntries({
        sourceEntries,
    });

    logCodeCommentTranslationDebug(codeCommentPlans);

    const prompt = buildTranslationPrompt({
        locale: args.locale,
        sourceLocale: args.sourceLocale,
        entries: entriesForProvider,
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
        sourceEntries: entriesForProvider,
        translatedEntries,
        locale: args.locale,
    });

    const resolvedTranslatedEntries = resolveTranslatedEntries({
        sourceEntries,
        translatedEntries,
        codeCommentPlans,
    });

    assertTranslationCompleteness({
        sourceEntries,
        translatedEntries: resolvedTranslatedEntries,
        locale: args.locale,
    });

    return rebuildTranslatedMessages({
        sourceMessages: args.sourceMessages,
        translatedEntries: resolvedTranslatedEntries,
    });
}

