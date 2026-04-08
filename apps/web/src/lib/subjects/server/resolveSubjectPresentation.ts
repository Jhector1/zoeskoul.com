import "server-only";

import { SUBJECT_MANIFESTS } from "./subjectManifestRegistry";
import { resolveTaggedOnServer } from "@/i18n/server";
import type {
    ResolvedModuleIntroView,
    ResolvedSubjectCatalogMap,
    ResolvedSubjectModulesView,
    SubjectManifest,
} from "@/lib/subjects/_core/subjectManifestTypes";

const manifestMap = SUBJECT_MANIFESTS as Record<string, SubjectManifest>;

function asTag(key?: string | null) {
    return key ? (`@:${key}` as const) : null;
}

export async function getResolvedSubjectCatalogMap(): Promise<ResolvedSubjectCatalogMap> {
    const entries = await Promise.all(
        Object.entries(manifestMap).map(async ([slug, manifest]) => {
            const resolved = (await resolveTaggedOnServer({
                slug: manifest.subject.slug,
                title: asTag(manifest.subject.titleKey) ?? manifest.subject.slug,
                description: asTag(manifest.subject.descriptionKey) ?? "",
                imagePublicId: manifest.subject.imagePublicId ?? null,
                imageAlt: manifest.subject.imageAlt ?? null,
                defaultModuleSlug: manifest.modules[0]?.slug ?? null,
            })) as ResolvedSubjectCatalogMap[string];

            return [slug, resolved] as const;
        }),
    );

    return Object.fromEntries(entries) as ResolvedSubjectCatalogMap;
}

export async function getResolvedModuleIntroFromManifest(
    subjectSlug: string,
    moduleSlug: string,
): Promise<ResolvedModuleIntroView | null> {
    const manifest = manifestMap[subjectSlug];
    if (!manifest) return null;

    const module = manifest.modules.find((m) => m.slug === moduleSlug);
    if (!module) return null;

    return (await resolveTaggedOnServer({
        subject: {
            slug: manifest.subject.slug,
            title: asTag(manifest.subject.titleKey) ?? manifest.subject.slug,
            description: asTag(manifest.subject.descriptionKey) ?? "",
            imagePublicId: manifest.subject.imagePublicId ?? null,
            imageAlt: manifest.subject.imageAlt ?? null,
        },
        module: {
            slug: module.slug,
            title: asTag(module.titleKey) ?? module.slug,
            description: asTag(module.descriptionKey) ?? "",
            order: module.order,
            weekStart: module.weekStart ?? null,
            weekEnd: module.weekEnd ?? null,
            meta: {
                estimatedMinutes: module.meta?.estimatedMinutes ?? null,
                prereqs: (module.meta?.prereqKeys ?? []).map((k) => `@:${k}`),
                outcomes: (module.meta?.outcomeKeys ?? []).map((k) => `@:${k}`),
                why: (module.meta?.whyKeys ?? []).map((k) => `@:${k}`),
            },
        },
    })) as ResolvedModuleIntroView;
}

export async function getResolvedSubjectModulesFromManifest(
    subjectSlug: string,
): Promise<ResolvedSubjectModulesView | null> {
    const manifest = manifestMap[subjectSlug];
    if (!manifest) return null;

    return (await resolveTaggedOnServer({
        subject: {
            slug: manifest.subject.slug,
            title: asTag(manifest.subject.titleKey) ?? manifest.subject.slug,
            description: asTag(manifest.subject.descriptionKey) ?? "",
        },
        modules: manifest.modules.map((m) => ({
            slug: m.slug,
            title: asTag(m.titleKey) ?? m.slug,
            description: asTag(m.descriptionKey) ?? "",
            order: m.order,
            weekStart: m.weekStart ?? null,
            weekEnd: m.weekEnd ?? null,
        })),
    })) as ResolvedSubjectModulesView;
}