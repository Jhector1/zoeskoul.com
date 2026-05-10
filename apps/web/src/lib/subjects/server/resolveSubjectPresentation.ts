import "server-only";

import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import { CATALOG_MANIFESTS } from "@/lib/subjects/catalogs.generated";
import { resolveTaggedOnServer } from "@/i18n/resolveTaggedOnServer";
import {
    getRawReviewModule,
    getRawReviewModuleRows,
} from "@/lib/subjects/registry";
import type {
    ReviewCard,
    ReviewModule,
    ReviewModuleSection,
    ReviewProjectSpec,
    ReviewQuizSpec,
    ReviewTopicShape,
} from "@/lib/subjects/types";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

function indexBy<T extends { slug: string }>(items: readonly T[]) {
    return Object.fromEntries(items.map((x) => [x.slug, x])) as Record<string, T>;
}

const subjectBySlug = indexBy(SUBJECT_ARTIFACTS.subjects);
const moduleBySlug = indexBy(SUBJECT_ARTIFACTS.modules);
const sectionBySlug = indexBy(SUBJECT_ARTIFACTS.sections);

function sortByOrderThenSlug<T extends { order: number; slug: string }>(a: T, b: T) {
    return a.order - b.order || a.slug.localeCompare(b.slug);
}

function getSubjectStatus(subject: unknown): "active" | "coming_soon" | "disabled" {
    const value = (subject as { status?: unknown } | null)?.status;
    return value === "coming_soon" || value === "disabled" ? value : "active";
}

export type ResolvedSubjectVersioning = {
    family: string;
    version: number;
    status: "draft" | "active" | "legacy" | "disabled";
    defaultForNewEnrollments?: boolean;
    supersedes?: string | null;
    supersededBy?: string | null;
};

export type ResolvedSubjectCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
    versioning?: ResolvedSubjectVersioning;
};

export type ResolvedSubjectCatalogMap = Record<string, ResolvedSubjectCatalogItem>;

export type ResolvedCatalogSubjectItem = ResolvedSubjectCatalogItem & {
    status: "active" | "coming_soon" | "disabled";
};

export type ResolvedCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultSubjectSlug: string | null;
    status: "active" | "coming_soon" | "disabled";
    subjects: ResolvedCatalogSubjectItem[];
};

export type ResolvedCatalogMap = Record<string, ResolvedCatalogItem>;

export type ResolvedSectionPresentation = {
    slug: string;
    title: string;
    description: string;
    order: number;
    moduleSlug: string;
};

export type ResolvedSubjectModule = {
    slug: string;
    title: string;
    description: string;
    order: number;
    weekStart: number | null;
    weekEnd: number | null;
    meta: {
        estimatedMinutes: number | null;
        prereqs: string[];
        outcomes: string[];
        why: string[];
        videoUrl: string | null;
    };
};

export type ResolvedSubjectModulesView = {
    subject: {
        slug: string;
        title: string;
        description: string;
        imagePublicId: string | null;
        imageAlt: string | null;
    };
    modules: ResolvedSubjectModule[];
};

export type ResolvedModuleIntroView = {
    subject: {
        slug: string;
        title: string;
        description: string;
        imagePublicId: string | null;
        imageAlt: string | null;
    };
    module: ResolvedSubjectModule;
};

export type ResolvedReviewModuleRow = {
    slug: string;
    order: number;
    title: string;
};

function normalizeRuntimeDefaults(
    value: unknown,
): ManifestRuntimeDefaults | null | undefined {
    if (value == null) return value as null | undefined;
    if (typeof value !== "object") return undefined;

    const v = value as Record<string, unknown>;

    if (v.kind === "sql") {
        return {
            kind: "sql",
            ...(typeof v.datasetId === "string" ? { datasetId: v.datasetId } : {}),
            ...(typeof v.fixedSqlDialect === "string"
                ? { fixedSqlDialect: v.fixedSqlDialect as any }
                : {}),
            ...(typeof v.resultShape === "string"
                ? { resultShape: v.resultShape as any }
                : {}),
            ...(typeof v.showSchema === "boolean" ? { showSchema: v.showSchema } : {}),
            ...(typeof v.showErd === "boolean" ? { showErd: v.showErd } : {}),
            ...(typeof v.showChen === "boolean" ? { showChen: v.showChen } : {}),
            ...(typeof v.supportsTerminal === "boolean"
                ? { supportsTerminal: v.supportsTerminal }
                : {}),
            ...(typeof v.supportsMultiFile === "boolean"
                ? { supportsMultiFile: v.supportsMultiFile }
                : {}),
            ...(typeof v.supportsFileSystem === "boolean"
                ? { supportsFileSystem: v.supportsFileSystem }
                : {}),
        };
    }
    if (v.kind === "code") {
        return {
            kind: "code",
            ...(typeof v.language === "string" ? { language: v.language as any } : {}),
            ...(typeof v.supportsTerminal === "boolean"
                ? { supportsTerminal: v.supportsTerminal }
                : {}),
            ...(typeof v.supportsMultiFile === "boolean"
                ? { supportsMultiFile: v.supportsMultiFile }
                : {}),
            ...(typeof v.supportsFileSystem === "boolean"
                ? { supportsFileSystem: v.supportsFileSystem }
                : {}),
            ...(typeof v.supportsStdInStdOut === "boolean"
                ? { supportsStdInStdOut: v.supportsStdInStdOut }
                : {}),
            ...(typeof v.supportsPackageInstall === "boolean"
                ? { supportsPackageInstall: v.supportsPackageInstall }
                : {}),
        };
    }

    return undefined;
}

function normalizeQuizSpec(spec: ReviewQuizSpec): ReviewQuizSpec {
    return {
        ...spec,
        runtime: normalizeRuntimeDefaults(spec.runtime) ?? null,
    };
}

function normalizeProjectSpec(spec: ReviewProjectSpec): ReviewProjectSpec {
    return {
        ...spec,
        runtime: normalizeRuntimeDefaults(spec.runtime) ?? null,
        steps: spec.steps.map((step) => ({ ...step })),
    };
}

function normalizeCard(card: ReviewCard): ReviewCard {
    switch (card.type) {
        case "quiz":
            return {
                ...card,
                spec: normalizeQuizSpec(card.spec),
            };

        case "project":
            return {
                ...card,
                spec: normalizeProjectSpec(card.spec),
            };

        default:
            return { ...card };
    }
}

function normalizeTopic(topic: ReviewTopicShape): ReviewTopicShape {
    return {
        ...topic,
        meta: topic.meta
            ? {
                ...topic.meta,
                runtimeDefaults:
                    normalizeRuntimeDefaults(topic.meta.runtimeDefaults) ?? null,
            }
            : null,
        cards: topic.cards.map((card) => normalizeCard(card)),
    };
}

function normalizeSection(section: ReviewModuleSection): ReviewModuleSection {
    return {
        ...section,
        summary: section.summary ?? null,
        description: section.description ?? section.summary ?? null,
        topics: section.topics.map((topic) =>
            normalizeTopic(topic as ReviewTopicShape),
        ),
    };
}

async function resolveSubjectCatalogItem(
    subjectSlug: string,
): Promise<ResolvedCatalogSubjectItem | null> {
    const subject = subjectBySlug[subjectSlug];
    if (!subject) return null;

    const resolved = await resolveTaggedOnServer({
        slug: subject.slug,
        title: subject.title,
        description: subject.description ?? "",
        imagePublicId: subject.imagePublicId ?? null,
        imageAlt: subject.imageAlt ?? null,
    });

    const defaultModuleSlug =
        SUBJECT_ARTIFACTS.modules
            .filter((m) => m.subjectSlug === subject.slug)
            .sort(sortByOrderThenSlug)[0]?.slug ?? null;

    return {
        slug: subject.slug,
        title: resolved.title,
        description: resolved.description ?? "",
        imagePublicId: resolved.imagePublicId ?? null,
        imageAlt: resolved.imageAlt ?? resolved.title ?? subject.slug,
        defaultModuleSlug,
        status: getSubjectStatus(subject),
        versioning: subject.meta?.versioning as ResolvedSubjectVersioning | undefined,    };
}

export async function getResolvedSubjectCardMap(): Promise<ResolvedSubjectCatalogMap> {
    const out: ResolvedSubjectCatalogMap = {};

    for (const subject of SUBJECT_ARTIFACTS.subjects) {
        const item = await resolveSubjectCatalogItem(subject.slug);
        if (item) out[subject.slug] = item;
    }

    return out;
}

export async function getResolvedSubjectCatalogMap(): Promise<ResolvedSubjectCatalogMap> {
    return getResolvedSubjectCardMap();
}

export async function getResolvedCatalogMap(): Promise<ResolvedCatalogMap> {
    const out: ResolvedCatalogMap = {};

    const catalogEntries = Object.values(CATALOG_MANIFESTS)
        .map((entry) => entry.catalog)
        .sort(sortByOrderThenSlug);

    for (const catalog of catalogEntries) {
        const subjects = (
            await Promise.all(
                catalog.subjectSlugs.map((subjectSlug) =>
                    resolveSubjectCatalogItem(subjectSlug),
                ),
            )
        )
            .filter((value): value is ResolvedCatalogSubjectItem => Boolean(value))
            .sort((a, b) => {
                const leftOrder = Number(subjectBySlug[a.slug]?.order ?? 0);
                const rightOrder = Number(subjectBySlug[b.slug]?.order ?? 0);
                return leftOrder - rightOrder || a.slug.localeCompare(b.slug);
            });

        out[catalog.slug] = {
            slug: catalog.slug,
            title: catalog.title,
            description: catalog.description ?? "",
            imagePublicId: catalog.imagePublicId ?? null,
            imageAlt: catalog.imageAlt ?? catalog.title,
            defaultSubjectSlug: catalog.defaultSubjectSlug ?? subjects[0]?.slug ?? null,
            status: catalog.status ?? "active",
            subjects,
        };
    }

    return out;
}

export async function getResolvedCatalogBySlug(
    catalogSlug: string,
): Promise<ResolvedCatalogItem | null> {
    const map = await getResolvedCatalogMap();
    return map[catalogSlug] ?? null;
}

export async function getResolvedSubjectModulesFromManifest(
    subjectSlug: string,
): Promise<ResolvedSubjectModulesView | null> {
    const subject = subjectBySlug[subjectSlug];
    if (!subject) return null;

    const resolvedSubject = await resolveTaggedOnServer({
        slug: subject.slug,
        title: subject.title,
        description: subject.description ?? "",
        imagePublicId: subject.imagePublicId ?? null,
        imageAlt: subject.imageAlt ?? null,
    });

    const rawModules = SUBJECT_ARTIFACTS.modules
        .filter((m) => m.subjectSlug === subjectSlug)
        .sort(sortByOrderThenSlug)
        .map((m) => ({
            slug: m.slug,
            title: m.title,
            description: m.description ?? "",
            order: m.order,
            weekStart: m.weekStart ?? null,
            weekEnd: m.weekEnd ?? null,
            meta: {
                estimatedMinutes: m.meta?.estimatedMinutes ?? null,
                prereqs: [...(m.meta?.prereqs ?? [])],
                outcomes: [...(m.meta?.outcomes ?? [])],
                why: [...(m.meta?.why ?? [])],
                videoUrl: m.meta?.videoUrl ?? null,
            },
        }));

    const modules = await Promise.all(
        rawModules.map(async (m) => {
            const resolved = await resolveTaggedOnServer(m);

            return {
                slug: resolved.slug,
                title: resolved.title,
                description: resolved.description ?? "",
                order: resolved.order,
                weekStart: resolved.weekStart ?? null,
                weekEnd: resolved.weekEnd ?? null,
                meta: {
                    estimatedMinutes: resolved.meta?.estimatedMinutes ?? null,
                    prereqs: [...(resolved.meta?.prereqs ?? [])],
                    outcomes: [...(resolved.meta?.outcomes ?? [])],
                    why: [...(resolved.meta?.why ?? [])],
                    videoUrl: resolved.meta?.videoUrl ?? null,
                },
            } satisfies ResolvedSubjectModule;
        }),
    );

    return {
        subject: {
            slug: subject.slug,
            title: resolvedSubject.title,
            description: resolvedSubject.description ?? "",
            imagePublicId: resolvedSubject.imagePublicId ?? null,
            imageAlt: resolvedSubject.imageAlt ?? resolvedSubject.title ?? subject.slug,
        },
        modules,
    };
}

export async function getResolvedModuleIntroFromManifest(
    subjectSlug: string,
    moduleSlug: string,
): Promise<ResolvedModuleIntroView | null> {
    const subject = subjectBySlug[subjectSlug];
    const mod = moduleBySlug[moduleSlug];

    if (!subject) return null;
    if (!mod) return null;
    if (mod.subjectSlug !== subjectSlug) return null;

    const resolvedSubject = await resolveTaggedOnServer({
        slug: subject.slug,
        title: subject.title,
        description: subject.description ?? "",
        imagePublicId: subject.imagePublicId ?? null,
        imageAlt: subject.imageAlt ?? null,
    });

    const resolvedModule = await resolveTaggedOnServer({
        slug: mod.slug,
        title: mod.title,
        description: mod.description ?? "",
        order: mod.order,
        weekStart: mod.weekStart ?? null,
        weekEnd: mod.weekEnd ?? null,
        meta: {
            estimatedMinutes: mod.meta?.estimatedMinutes ?? null,
            prereqs: [...(mod.meta?.prereqs ?? [])],
            outcomes: [...(mod.meta?.outcomes ?? [])],
            why: [...(mod.meta?.why ?? [])],
            videoUrl: mod.meta?.videoUrl ?? null,
        },
    });

    return {
        subject: {
            slug: resolvedSubject.slug,
            title: resolvedSubject.title,
            description: resolvedSubject.description ?? "",
            imagePublicId: resolvedSubject.imagePublicId ?? null,
            imageAlt: resolvedSubject.imageAlt ?? resolvedSubject.title ?? subject.slug,
        },
        module: {
            slug: resolvedModule.slug,
            title: resolvedModule.title,
            description: resolvedModule.description ?? "",
            order: resolvedModule.order,
            weekStart: resolvedModule.weekStart ?? null,
            weekEnd: resolvedModule.weekEnd ?? null,
            meta: {
                estimatedMinutes: resolvedModule.meta?.estimatedMinutes ?? null,
                prereqs: [...(resolvedModule.meta?.prereqs ?? [])],
                outcomes: [...(resolvedModule.meta?.outcomes ?? [])],
                why: [...(resolvedModule.meta?.why ?? [])],
                videoUrl: resolvedModule.meta?.videoUrl ?? null,
            },
        },
    };
}

export async function getResolvedSectionPresentationMap(
    subjectSlug: string,
): Promise<Record<string, ResolvedSectionPresentation>> {
    const sections = SUBJECT_ARTIFACTS.sections
        .filter((s) => s.subjectSlug === subjectSlug)
        .sort(sortByOrderThenSlug);

    const entries = await Promise.all(
        sections.map(async (s) => {
            const resolved = await resolveTaggedOnServer({
                slug: s.slug,
                title: s.title,
                description: s.description ?? "",
                order: s.order,
                moduleSlug: s.moduleSlug,
            });

            return [
                s.slug,
                {
                    slug: resolved.slug,
                    title: resolved.title,
                    description: resolved.description ?? "",
                    order: resolved.order,
                    moduleSlug: resolved.moduleSlug,
                } satisfies ResolvedSectionPresentation,
            ] as const;
        }),
    );

    return Object.fromEntries(entries);
}

export async function getResolvedReviewModuleRows(
    subjectSlug: string,
): Promise<ResolvedReviewModuleRow[] | null> {
    const raw = getRawReviewModuleRows(subjectSlug);
    if (!raw) return null;

    return Promise.all(
        raw.map(async (row) => {
            const resolved = await resolveTaggedOnServer(row);

            return {
                slug: resolved.slug,
                order: resolved.order,
                title: resolved.title,
            };
        }),
    );
}

export async function getResolvedReviewModule(
    subjectSlug: string,
    moduleSlug: string,
): Promise<ReviewModule | null> {
    const raw = getRawReviewModule(subjectSlug, moduleSlug);
    if (!raw) return null;

    const resolved = await resolveTaggedOnServer(raw);

    const topics = resolved.topics.map((topic) =>
        normalizeTopic(topic as ReviewTopicShape),
    );

    const sections = ((resolved.sections ?? []) as ReviewModuleSection[]).map(
        normalizeSection,
    );

    return {
        id: resolved.id,
        title: resolved.title,
        subtitle: resolved.subtitle ?? null,
        startPracticeSectionSlug: resolved.startPracticeSectionSlug,
        runtimeDefaults: normalizeRuntimeDefaults(resolved.runtimeDefaults) ?? null,
        topics,
        sections,
    } satisfies ReviewModule;
}

export function getRawModuleBySlug(moduleSlug: string) {
    return moduleBySlug[moduleSlug] ?? null;
}

export function getRawSectionBySlug(sectionSlug: string) {
    return sectionBySlug[sectionSlug] ?? null;
}
