import "server-only";

import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import { resolveTaggedOnServer } from "@/i18n/resolveTaggedOnServer";
import {
    getRawReviewModule,
    getRawReviewModuleRows,
} from "@/lib/subjects/registry";
import type {ReviewCard, ReviewModule, ReviewProjectSpec, ReviewQuizSpec, ReviewTopicShape} from "@/lib/subjects/types";
import {ManifestRuntimeDefaults} from "@/lib/subjects/_core/manifestTypes";

function indexBy<T extends { slug: string }>(items: readonly T[]) {
    return Object.fromEntries(items.map((x) => [x.slug, x])) as Record<string, T>;
}

const subjectBySlug = indexBy(SUBJECT_ARTIFACTS.subjects);
const moduleBySlug = indexBy(SUBJECT_ARTIFACTS.modules);
const sectionBySlug = indexBy(SUBJECT_ARTIFACTS.sections);

function sortByOrderThenSlug<T extends { order: number; slug: string }>(a: T, b: T) {
    return a.order - b.order || a.slug.localeCompare(b.slug);
}

export type ResolvedSubjectCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
};

export type ResolvedSubjectCatalogMap = Record<string, ResolvedSubjectCatalogItem>;

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
        };
    }

    if (v.kind === "code") {
        return {
            kind: "code",
            ...(typeof v.language === "string"
                ? { language: v.language as any }
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
export async function getResolvedSubjectCatalogMap(): Promise<ResolvedSubjectCatalogMap> {
    const out: ResolvedSubjectCatalogMap = {};

    for (const subject of SUBJECT_ARTIFACTS.subjects) {
        const raw = {
            slug: subject.slug,
            title: subject.title,
            description: subject.description ?? "",
            imagePublicId: subject.imagePublicId ?? null,
            imageAlt: subject.imageAlt ?? null,
        };

        const resolved = await resolveTaggedOnServer(raw);

        const defaultModuleSlug =
            SUBJECT_ARTIFACTS.modules
                .filter((m) => m.subjectSlug === subject.slug)
                .sort(sortByOrderThenSlug)[0]?.slug ?? null;

        out[subject.slug] = {
            slug: subject.slug,
            title: resolved.title,
            description: resolved.description ?? "",
            imagePublicId: resolved.imagePublicId ?? null,
            imageAlt: resolved.imageAlt ?? resolved.title ?? subject.slug,
            defaultModuleSlug,
        };
    }

    return out;
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

    return {
        id: resolved.id,
        title: resolved.title,
        subtitle: resolved.subtitle ?? null,
        startPracticeSectionSlug: resolved.startPracticeSectionSlug,
        runtimeDefaults: normalizeRuntimeDefaults(resolved.runtimeDefaults) ?? null,
        topics: resolved.topics.map((topic) =>
            normalizeTopic(topic as ReviewTopicShape),
        ),
    } satisfies ReviewModule;
}

export function getRawModuleBySlug(moduleSlug: string) {
    return moduleBySlug[moduleSlug] ?? null;
}

export function getRawSectionBySlug(sectionSlug: string) {
    return sectionBySlug[sectionSlug] ?? null;
}