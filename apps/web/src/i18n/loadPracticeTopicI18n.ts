// src/lib/practice/i18n/loadPracticeTopicI18n.ts
import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

type PracticeTopicI18n = {
    common: Record<string, any>;
    quiz: Record<string, any>;
};

const CACHE = new Map<string, Promise<PracticeTopicI18n>>();

function isObject(v: unknown): v is Record<string, any> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T extends Record<string, any>, U extends Record<string, any>>(target: T, source: U): T & U {
    const out: Record<string, any> = { ...target };

    for (const [k, v] of Object.entries(source)) {
        if (isObject(v) && isObject(out[k])) {
            out[k] = deepMerge(out[k], v);
        } else {
            out[k] = v;
        }
    }

    return out as T & U;
}

async function readJsonIfExists(filePath: string): Promise<Record<string, any> | null> {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function parseTopicBase(raw: string) {
    const s = String(raw ?? "").trim();
    const parts = s.split(".").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
}

function normalizeModuleDirCandidates(moduleSlug?: string | null, topicSlug?: string | null) {
    const out = new Set<string>();

    const m = String(moduleSlug ?? "").trim();
    if (m) out.add(m);

    // python-1 -> module1
    const m1 = m.match(/^python-(\d+)$/i);
    if (m1) out.add(`module${m1[1]}`);

    // py1 -> module1
    const m2 = m.match(/^py(\d+)$/i);
    if (m2) out.add(`module${m2[1]}`);

    // derive from topic prefix if needed: py1.input_output_patterns -> module1
    const topicRaw = String(topicSlug ?? "").trim();
    const prefix = topicRaw.split(".")[0] ?? "";
    const t1 = prefix.match(/^py(\d+)$/i);
    if (t1) out.add(`module${t1[1]}`);

    return Array.from(out).filter(Boolean);
}

async function findFirstFileRecursive(rootDir: string, fileName: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });

        for (const entry of entries) {
            const full = path.join(rootDir, entry.name);

            if (entry.isFile() && entry.name === fileName) {
                return full;
            }

            if (entry.isDirectory()) {
                const found = await findFirstFileRecursive(full, fileName);
                if (found) return found;
            }
        }

        return null;
    } catch {
        return null;
    }
}

async function resolveTopicFile(args: {
    locale: string;
    subjectSlug?: string | null;
    moduleSlug?: string | null;
    topicSlug: string;
}) {
    const { locale, subjectSlug, moduleSlug, topicSlug } = args;

    const topicBase = parseTopicBase(topicSlug);
    const fileName = `${topicBase}.json`;

    const localeRoot = path.join(process.cwd(), "src", "i18n", "messages", locale);
    const subjectRoot = subjectSlug
        ? path.join(localeRoot, "subjects", subjectSlug)
        : null;

    const moduleDirs = normalizeModuleDirCandidates(moduleSlug, topicSlug);

    // 1) Try direct likely paths first
    if (subjectRoot) {
        for (const mod of moduleDirs) {
            const direct = path.join(subjectRoot, mod, fileName);
            try {
                await fs.access(direct);
                return direct;
            } catch {
                // continue
            }
        }

        // 2) Fallback: search recursively under the subject folder
        const found = await findFirstFileRecursive(subjectRoot, fileName);
        if (found) return found;
    }

    // 3) Last resort: search recursively across the locale tree
    return findFirstFileRecursive(localeRoot, fileName);
}

export async function loadPracticeTopicI18n(args: {
    locale: string;
    subjectSlug?: string | null;
    moduleSlug?: string | null;
    topicSlug: string;
}): Promise<PracticeTopicI18n> {
    const locale = String(args.locale || "en").trim() || "en";
    const subjectSlug = String(args.subjectSlug ?? "").trim() || null;
    const moduleSlug = String(args.moduleSlug ?? "").trim() || null;
    const topicSlug = String(args.topicSlug ?? "").trim();

    const cacheKey = JSON.stringify({ locale, subjectSlug, moduleSlug, topicSlug });
    const cached = CACHE.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<PracticeTopicI18n> => {
        const localeRoot = path.join(process.cwd(), "src", "i18n", "messages", locale);
        const enRoot = path.join(process.cwd(), "src", "i18n", "messages", "en");

        const commonLocale = (await readJsonIfExists(path.join(localeRoot, "common.json"))) ?? {};
        const commonEn = (await readJsonIfExists(path.join(enRoot, "common.json"))) ?? {};

        const topicFileLocale = await resolveTopicFile({
            locale,
            subjectSlug,
            moduleSlug,
            topicSlug,
        });

        const topicFileEn = locale !== "en"
            ? await resolveTopicFile({
                locale: "en",
                subjectSlug,
                moduleSlug,
                topicSlug,
            })
            : null;

        const topicLocale = topicFileLocale ? (await readJsonIfExists(topicFileLocale)) ?? {} : {};
        const topicEn = topicFileEn ? (await readJsonIfExists(topicFileEn)) ?? {} : {};

        const mergedTopic = deepMerge(topicEn, topicLocale);

        return {
            common: deepMerge(commonEn, {
                ...commonLocale,
                ...(isObject(mergedTopic.common) ? mergedTopic.common : {}),
            }),
            quiz: isObject(mergedTopic.quiz) ? mergedTopic.quiz : {},
        };
    })();

    CACHE.set(cacheKey, promise);
    return promise;
}