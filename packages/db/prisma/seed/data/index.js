import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dataDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dataDir, "../../../../..");
const subjectsRoot = path.join(repoRoot, "apps/web/src/lib/subjects");
const authoringCatalogsRoot = path.join(repoRoot, "authoring", "catalogs");
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function tag(key) {
    return key ? `@:${key}` : null;
}
function loadSubjectManifest(subjectSlug) {
    return readJson(path.join(subjectsRoot, subjectSlug, "subject.manifest.json"));
}
function loadCatalogManifest(fileName) {
    return readJson(path.join(authoringCatalogsRoot, fileName));
}
function loadTopicBundle(args) {
    return readJson(path.join(subjectsRoot, args.subjectSlug, "modules", `module${args.moduleOrder}`, "topics", args.topicId, "topic.bundle.json"));
}
export function isSeedableSubjectSlug(subjectSlug) {
    return !subjectSlug.endsWith("--draft");
}
export function listSubjectSlugs() {
    return fs
        .readdirSync(subjectsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((subjectSlug) => {
        if (isSeedableSubjectSlug(subjectSlug))
            return true;
        console.warn(`[db:seed] Skipping generated draft subject folder: ${subjectSlug}`);
        return false;
    })
        .filter((subjectSlug) => fs.existsSync(path.join(subjectsRoot, subjectSlug, "subject.manifest.json")))
        .sort();
}
function listCatalogFileNames() {
    if (!fs.existsSync(authoringCatalogsRoot))
        return [];
    return fs
        .readdirSync(authoringCatalogsRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".catalog.json"))
        .map((entry) => entry.name)
        .sort();
}
function buildSeedData() {
    const catalogs = [];
    const subjects = [];
    const modules = [];
    const sections = [];
    const topics = [];
    const subjectToCatalog = new Map();
    for (const fileName of listCatalogFileNames()) {
        const manifest = loadCatalogManifest(fileName);
        const catalog = manifest.catalog;
        catalogs.push({
            slug: catalog.slug,
            order: catalog.order,
            title: catalog.title,
            description: catalog.description ?? null,
            imagePublicId: catalog.imagePublicId ?? null,
            imageAlt: catalog.imageAlt ?? null,
            defaultSubjectSlug: catalog.defaultSubjectSlug ?? catalog.subjectSlugs[0] ?? null,
            status: catalog.status ?? "active",
            meta: catalog.meta ?? null,
        });
        for (const subjectSlug of catalog.subjectSlugs) {
            const existing = subjectToCatalog.get(subjectSlug);
            if (existing && existing !== catalog.slug) {
                throw new Error(`Subject "${subjectSlug}" is assigned to multiple catalogs: "${existing}" and "${catalog.slug}"`);
            }
            subjectToCatalog.set(subjectSlug, catalog.slug);
        }
    }
    for (const subjectSlug of listSubjectSlugs()) {
        const manifest = loadSubjectManifest(subjectSlug);
        const subject = manifest.subject;
        const catalogSlug = String(subject.catalogSlug ?? subjectToCatalog.get(subject.slug) ?? subject.slug).trim();
        if (!catalogSlug) {
            throw new Error(`Subject "${subject.slug}" is missing a catalogSlug`);
        }
        const expectedCatalogSlug = subjectToCatalog.get(subject.slug);
        if (!expectedCatalogSlug) {
            throw new Error(`Subject "${subject.slug}" is not listed in any authoring/catalogs/*.catalog.json file`);
        }
        if (expectedCatalogSlug && expectedCatalogSlug !== catalogSlug) {
            throw new Error(`Subject "${subject.slug}" points to catalog "${catalogSlug}" but catalog manifests assign "${expectedCatalogSlug}"`);
        }
        subjects.push({
            slug: subject.slug,
            catalogSlug,
            order: subject.order,
            title: tag(subject.titleKey) ?? subject.slug,
            description: tag(subject.descriptionKey),
            imagePublicId: subject.imagePublicId ?? null,
            imageAlt: subject.imageAlt ?? null,
            accessPolicy: subject.accessPolicy ?? "free",
            status: subject.status ?? "active",
            meta: subject.meta ?? null,
        });
        for (const mod of manifest.modules) {
            modules.push({
                slug: mod.slug,
                subjectSlug: subject.slug,
                order: mod.order,
                title: tag(mod.titleKey) ?? mod.slug,
                description: tag(mod.descriptionKey),
                weekStart: mod.weekStart ?? null,
                weekEnd: mod.weekEnd ?? null,
                accessOverride: mod.accessOverride ?? "inherit",
                entitlementKey: mod.entitlementKey ?? null,
                meta: {
                    estimatedMinutes: mod.meta?.estimatedMinutes,
                    prereqs: (mod.meta?.prereqKeys ?? []).map((key) => tag(key) ?? key),
                    outcomes: (mod.meta?.outcomeKeys ?? []).map((key) => tag(key) ?? key),
                    why: (mod.meta?.whyKeys ?? []).map((key) => tag(key) ?? key),
                },
            });
            for (const section of mod.sections) {
                const topicSlugs = section.topics.map((topicId) => `${mod.prefix}.${topicId}`);
                sections.push({
                    slug: section.slug,
                    subjectSlug: subject.slug,
                    moduleSlug: mod.slug,
                    order: section.order,
                    title: tag(section.titleKey) ?? section.slug,
                    description: tag(section.descriptionKey),
                    meta: {
                        ...(section.meta ?? {}),
                        ...(section.meta?.weeksKey
                            ? { weeks: tag(section.meta.weeksKey) }
                            : {}),
                        ...(section.meta?.bulletKeys?.length
                            ? {
                                bullets: section.meta.bulletKeys.map((key) => tag(key) ?? key),
                            }
                            : {}),
                    },
                    topicSlugs,
                });
                for (let index = 0; index < section.topics.length; index += 1) {
                    const topicId = section.topics[index];
                    const topicBundle = loadTopicBundle({
                        subjectSlug: subject.slug,
                        moduleOrder: mod.order,
                        topicId,
                    });
                    topics.push({
                        slug: `${mod.prefix}.${topicId}`,
                        subjectSlug: subject.slug,
                        moduleSlug: mod.slug,
                        order: index,
                        titleKey: topicBundle.topic.labelKey,
                        description: tag(topicBundle.topic.summaryKey),
                        genKey: subject.genKey,
                        variant: topicId,
                        meta: {
                            label: tag(topicBundle.topic.labelKey) ?? topicId,
                            minutes: topicBundle.minutes,
                            pool: (topicBundle.exercises ?? []).map((exercise) => ({
                                key: exercise.id,
                                w: exercise.weight ?? 1,
                                kind: exercise.kind,
                            })),
                            runtimeDefaults: topicBundle.runtimeDefaults ?? mod.runtimeDefaults ?? null,
                        },
                    });
                }
            }
        }
    }
    return {
        catalogs,
        subjects,
        modules,
        topics,
        sections,
    };
}
const seedData = buildSeedData();
export const CATALOGS = seedData.catalogs;
export const SUBJECTS = seedData.subjects;
export const MODULES = seedData.modules;
export const TOPICS = seedData.topics;
export const SECTIONS = seedData.sections;
