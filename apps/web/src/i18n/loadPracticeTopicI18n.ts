// src/lib/practice/i18n/loadPracticeTopicI18n.ts
import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

type PracticeTopicI18n = Record<string, any> & {
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

function findTopicMessagesNode(args: {
    messages: Record<string, any>;
    subjectSlug?: string | null;
    topicBase: string;
}) {
    const topicsRoot = isObject(args.messages.topics) ? args.messages.topics : null;
    if (!topicsRoot) return null;

    const subjectCandidates = args.subjectSlug
        ? [topicsRoot[args.subjectSlug]]
        : Object.values(topicsRoot);

    for (const subjectNode of subjectCandidates) {
        if (!isObject(subjectNode)) continue;

        for (const moduleNode of Object.values(subjectNode)) {
            if (!isObject(moduleNode)) continue;

            const topicNode = moduleNode[args.topicBase];
            if (isObject(topicNode)) {
                return topicNode;
            }
        }
    }

    return null;
}

function parseTopicBase(raw: string) {
    const s = String(raw ?? "").trim();
    const parts = s.split(".").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
}

function normalizeModuleDirCandidates(moduleSlug?: string | null, topicSlug?: string | null) {
    const out = new Set<string>();

    const addModuleNumber = (value: string) => {
        const normalized = value.trim();
        if (!normalized) return;

        const explicit = normalized.match(/(?:^|[-_])module[-_]?(\d+)$/i);
        if (explicit) out.add(`module${explicit[1]}`);

        const trailing = normalized.match(/(?:^|[-_])(\d+)$/i);
        if (trailing) out.add(`module${trailing[1]}`);

        const compact = normalized.match(/^[a-z]+(\d+)$/i);
        if (compact) out.add(`module${compact[1]}`);
    };

    const m = String(moduleSlug ?? "").trim();
    if (m) {
        out.add(m);
        addModuleNumber(m);
    }

    // derive from topic prefix if needed: py1.input_output_patterns -> module1
    const topicRaw = String(topicSlug ?? "").trim();
    const prefix = topicRaw.split(".")[0] ?? "";
    addModuleNumber(prefix);

    return Array.from(out).filter(Boolean);
}

async function directoryExists(dirPath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

async function childDirectoryNames(rootDir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

function inferredCatalogCandidates(subjectSlug: string | null): string[] {
    const slug = String(subjectSlug ?? "").trim().toLowerCase();
    if (!slug) return [];

    const out = new Set<string>();

    if (slug === "sql" || slug.startsWith("sql-")) out.add("sql");
    if (slug === "python" || slug.startsWith("python-") || slug.includes("python")) {
        out.add("python");
    }
    if (slug === "linux" || slug.startsWith("linux-") || slug.includes("linux")) {
        out.add("linux");
    }

    return Array.from(out);
}

async function resolveSubjectRootCandidates(args: {
    localeRoot: string;
    subjectSlug: string | null;
}): Promise<string[]> {
    const { localeRoot, subjectSlug } = args;
    const subjectsRoot = path.join(localeRoot, "subjects");
    const slug = String(subjectSlug ?? "").trim();
    const out: string[] = [];
    const seen = new Set<string>();

    async function add(candidate: string) {
        if (seen.has(candidate)) return;
        if (!(await directoryExists(candidate))) return;
        seen.add(candidate);
        out.push(candidate);
    }

    if (!slug) return out;

    for (const catalog of inferredCatalogCandidates(slug)) {
        await add(path.join(subjectsRoot, catalog, slug));
    }

    for (const catalog of await childDirectoryNames(subjectsRoot)) {
        await add(path.join(subjectsRoot, catalog, slug));
    }

    await add(path.join(subjectsRoot, slug));

    return out;
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
    const subjectRoots = await resolveSubjectRootCandidates({
        localeRoot,
        subjectSlug: subjectSlug ?? null,
    });

    const moduleDirs = normalizeModuleDirCandidates(moduleSlug, topicSlug);

    // 1) Try direct likely paths under the exact course root first.
    // Catalog layout examples:
    //   subjects/python/python-v2/module1/topic.json
    //   subjects/sql/sql-v2/module1/topic.json
    for (const subjectRoot of subjectRoots) {
        for (const mod of moduleDirs) {
            const direct = path.join(subjectRoot, mod, fileName);
            try {
                await fs.access(direct);
                return direct;
            } catch {
                // continue
            }
        }
    }

    // 2) Fallback: search recursively under exact course roots only.
    // This prevents sql-v2 from accidentally reading legacy sql messages when
    // both courses have a topic file with the same basename.
    for (const subjectRoot of subjectRoots) {
        const found = await findFirstFileRecursive(subjectRoot, fileName);
        if (found) return found;
    }

    // 3) Last resort for old flat subjects or incomplete metadata.
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
        const topicBase = parseTopicBase(topicSlug);

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
        const topicNode = findTopicMessagesNode({
            messages: mergedTopic,
            subjectSlug,
            topicBase,
        });
        const legacyQuiz = isObject(mergedTopic.quiz)
            ? mergedTopic.quiz
            : isObject(topicNode?.practice)
              ? topicNode.practice
              : {};

        return deepMerge(mergedTopic, {
            common: deepMerge(commonEn, {
                ...commonLocale,
                ...(isObject(mergedTopic.common) ? mergedTopic.common : {}),
            }),
            quiz: legacyQuiz,
        });
    })();

    CACHE.set(cacheKey, promise);
    return promise;
}
