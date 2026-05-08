#!/usr/bin/env node

import path from "node:path";
import {
    assertUnique,
    exists,
    getDirectories,
    readJsonFile,
    relFromProject,
    toSafeIdentifier,
    walkFiles,
    writeTextFile,
    projectRoot,
} from "./_shared/generator-common";

const subjectsRoot = path.join(projectRoot, "src", "lib", "subjects");
const authoringCatalogsRoot = path.resolve(
    projectRoot,
    "..",
    "..",
    "authoring",
    "catalogs",
);
const outputFile = path.join(subjectsRoot, "catalogs.generated.ts");

type VersioningMeta = {
    family?: string;
    version?: number;
    status?: "current" | "legacy" | "draft";
    supersedes?: string;
    supersededBy?: string;
};

type SubjectManifestJson = {
    subject?: {
        slug?: string;
        catalogSlug?: string | null;
        order?: number;
        status?: "active" | "coming_soon" | "disabled";
        meta?: Record<string, unknown> | null;
    };
};

type CatalogManifestJson = {
    catalog?: {
        slug?: string;
        order?: number;
        title?: string;
        description?: string | null;
        imagePublicId?: string | null;
        imageAlt?: string | null;
        defaultSubjectSlug?: string | null;
        status?: "active" | "coming_soon" | "disabled";
        subjectSlugs?: string[];
        meta?: Record<string, unknown> | null;
    };
};

type SubjectCatalogEntry = {
    slug: string;
    catalogSlug: string;
    order: number;
    status: "active" | "coming_soon" | "disabled";
    meta: Record<string, unknown> | null;
    manifestFile: string;
};

function getVersioningFromMeta(meta: Record<string, unknown> | null | undefined): VersioningMeta {
    const value = meta?.versioning;

    if (!value || typeof value !== "object") {
        return {};
    }

    return value as VersioningMeta;
}

function getSubjectVersioning(subject: SubjectCatalogEntry): VersioningMeta {
    return getVersioningFromMeta(subject.meta);
}

function getCatalogVersioning(catalog: CatalogManifestJson): {
    hideLegacyByDefault?: boolean;
} {
    const value = catalog.catalog?.meta?.versioning;

    if (!value || typeof value !== "object") {
        return {};
    }

    return value as {
        hideLegacyByDefault?: boolean;
    };
}

function subjectFamily(subject: SubjectCatalogEntry) {
    const versioning = getSubjectVersioning(subject);
    return String(versioning.family ?? subject.slug).trim() || subject.slug;
}

function subjectVersion(subject: SubjectCatalogEntry) {
    const versioning = getSubjectVersioning(subject);
    return Number(versioning.version ?? 0);
}

function subjectVersionStatus(subject: SubjectCatalogEntry) {
    return getSubjectVersioning(subject).status;
}

function groupSubjectsByFamily(subjects: SubjectCatalogEntry[]) {
    const groups = new Map<string, SubjectCatalogEntry[]>();

    for (const subject of subjects) {
        const family = subjectFamily(subject);
        const list = groups.get(family) ?? [];
        list.push(subject);
        groups.set(family, list);
    }

    return groups;
}

function pickCurrentSubject(subjects: SubjectCatalogEntry[]) {
    const current = subjects
        .filter((subject) => subject.status === "active")
        .filter((subject) => subjectVersionStatus(subject) === "current")
        .sort((a, b) => subjectVersion(b) - subjectVersion(a) || a.order - b.order)[0];

    if (current) return current;

    const nonDraft = subjects
        .filter((subject) => subject.status === "active")
        .filter((subject) => subjectVersionStatus(subject) !== "draft")
        .sort((a, b) => subjectVersion(b) - subjectVersion(a) || a.order - b.order)[0];

    if (nonDraft) return nonDraft;

    return [...subjects].sort(
        (a, b) => subjectVersion(b) - subjectVersion(a) || a.order - b.order,
    )[0];
}

function resolveGeneratedSubjectSlugs(args: {
    catalog: CatalogManifestJson;
    subjectsForCatalog: SubjectCatalogEntry[];
}) {
    const explicitSubjectSlugs = args.catalog.catalog?.subjectSlugs;

    if (Array.isArray(explicitSubjectSlugs) && explicitSubjectSlugs.length > 0) {
        return explicitSubjectSlugs;
    }

    const hideLegacyByDefault =
        getCatalogVersioning(args.catalog).hideLegacyByDefault === true;

    if (!hideLegacyByDefault) {
        return args.subjectsForCatalog
            .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
            .map((subject) => subject.slug);
    }

    const families = groupSubjectsByFamily(args.subjectsForCatalog);

    return Array.from(families.values())
        .map((familySubjects) => pickCurrentSubject(familySubjects))
        .filter((subject): subject is SubjectCatalogEntry => Boolean(subject))
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
        .map((subject) => subject.slug);
}

function resolveDefaultSubjectSlug(args: {
    catalog: CatalogManifestJson;
    generatedSubjectSlugs: string[];
    subjectsForCatalog: SubjectCatalogEntry[];
}) {
    const explicit =
        typeof args.catalog.catalog?.defaultSubjectSlug === "string"
            ? args.catalog.catalog.defaultSubjectSlug.trim()
            : "";

    if (explicit) return explicit;

    const families = groupSubjectsByFamily(args.subjectsForCatalog);
    const currentSubjects = Array.from(families.values())
        .map((familySubjects) => pickCurrentSubject(familySubjects))
        .filter((subject): subject is SubjectCatalogEntry => Boolean(subject))
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

    return currentSubjects[0]?.slug ?? args.generatedSubjectSlugs[0] ?? null;
}

function createUnknownSubjectError(args: {
    catalogSlug: string;
    subjectSlug: string;
    knownSubjects: string[];
}) {
    return new Error(
        [
            `Catalog "${args.catalogSlug}" references unknown subject "${args.subjectSlug}".`,
            "",
            "Fix one of these:",
            `1. Add apps/web/src/lib/subjects/${args.subjectSlug}/subject.manifest.json`,
            `2. Remove "${args.subjectSlug}" from the catalog subjectSlugs`,
            "3. Change defaultSubjectSlug to an existing subject",
            "",
            `Known subjects: ${args.knownSubjects.join(", ") || "(none)"}`,
        ].join("\n"),
    );
}

async function loadSubjectCatalogEntries() {
    const subjectDirs = await getDirectories(subjectsRoot);
    const subjectsBySlug: Record<string, SubjectCatalogEntry> = {};

    for (const subjectName of subjectDirs) {
        if (subjectName.startsWith("_")) continue;

        const manifestFile = path.join(
            subjectsRoot,
            subjectName,
            "subject.manifest.json",
        );
        if (!(await exists(manifestFile))) continue;

        const manifest = await readJsonFile<SubjectManifestJson>(manifestFile);
        const subjectSlug = String(manifest.subject?.slug ?? subjectName).trim();
        const catalogSlug = String(
            manifest.subject?.catalogSlug ?? manifest.subject?.slug ?? subjectName,
        ).trim();

        if (!subjectSlug) {
            throw new Error(`Missing subject slug in ${manifestFile}`);
        }

        if (!catalogSlug) {
            throw new Error(`Missing subject catalogSlug in ${manifestFile}`);
        }

        if (subjectsBySlug[subjectSlug]) {
            throw new Error(
                [
                    `Duplicate subject slug "${subjectSlug}".`,
                    `First: ${subjectsBySlug[subjectSlug].manifestFile}`,
                    `Second: ${manifestFile}`,
                ].join("\n"),
            );
        }

        subjectsBySlug[subjectSlug] = {
            slug: subjectSlug,
            catalogSlug,
            order: Number(manifest.subject?.order ?? 0),
            status: manifest.subject?.status ?? "active",
            meta: manifest.subject?.meta ?? null,
            manifestFile,
        };
    }

    return subjectsBySlug;
}

async function main() {
    const subjectsBySlug = await loadSubjectCatalogEntries();
    const knownSubjects = Object.keys(subjectsBySlug).sort();

    const catalogFiles = await walkFiles(
        authoringCatalogsRoot,
        (_fullPath, entryName) => entryName.endsWith(".catalog.json"),
    );

    const entries: Array<{
        slug: string;
        importName: string;
        manifest: CatalogManifestJson;
        subjectSlugs: string[];
        defaultSubjectSlug: string | null;
    }> = [];

    for (const catalogFile of catalogFiles) {
        const manifest = await readJsonFile<CatalogManifestJson>(catalogFile);
        const slug = String(manifest.catalog?.slug ?? "").trim();

        if (!slug) {
            throw new Error(`Missing catalog.slug in ${catalogFile}`);
        }

        const subjectsForCatalog = Object.values(subjectsBySlug).filter(
            (subject) => subject.catalogSlug === slug,
        );

        const subjectSlugs = resolveGeneratedSubjectSlugs({
            catalog: manifest,
            subjectsForCatalog,
        });

        if (!Array.isArray(subjectSlugs) || subjectSlugs.length === 0) {
            throw new Error(
                [
                    `Catalog "${slug}" must declare or discover at least one subject in ${catalogFile}`,
                    `Subjects with catalogSlug "${slug}": ${subjectsForCatalog
                        .map((subject) => subject.slug)
                        .join(", ") || "(none)"}`,
                ].join("\n"),
            );
        }

        assertUnique(subjectSlugs, `subject slug within catalog "${slug}"`, catalogFile);

        const defaultSubjectSlug = resolveDefaultSubjectSlug({
            catalog: manifest,
            generatedSubjectSlugs: subjectSlugs,
            subjectsForCatalog,
        });

        if (defaultSubjectSlug && !subjectSlugs.includes(defaultSubjectSlug)) {
            throw new Error(
                [
                    `Catalog "${slug}" defaultSubjectSlug "${defaultSubjectSlug}" is not listed in subjectSlugs.`,
                    "",
                    `Generated subjectSlugs: ${subjectSlugs.join(", ")}`,
                    "",
                    "If this is a legacy subject hidden by versioning, either:",
                    "1. Add it explicitly to catalog.subjectSlugs, or",
                    "2. Change defaultSubjectSlug to the current subject.",
                ].join("\n"),
            );
        }

        for (const subjectSlug of subjectSlugs) {
            const subject = subjectsBySlug[subjectSlug];

            if (!subject) {
                throw createUnknownSubjectError({
                    catalogSlug: slug,
                    subjectSlug,
                    knownSubjects,
                });
            }

            if (subject.catalogSlug !== slug) {
                throw new Error(
                    `Subject "${subjectSlug}" points to catalog "${subject.catalogSlug}" but catalog file "${slug}" also claims it`,
                );
            }
        }

        entries.push({
            slug,
            importName: toSafeIdentifier(`${slug}Catalog`, "catalog", "c"),
            manifest,
            subjectSlugs,
            defaultSubjectSlug,
        });
    }

    assertUnique(
        entries.map((entry) => entry.slug),
        "catalog slug",
        outputFile,
    );

    const coveredSubjects = new Set<string>();
    for (const entry of entries) {
        for (const subjectSlug of entry.subjectSlugs) {
            if (coveredSubjects.has(subjectSlug)) {
                throw new Error(
                    `Subject "${subjectSlug}" is assigned to more than one catalog`,
                );
            }
            coveredSubjects.add(subjectSlug);
        }
    }

    for (const subject of Object.values(subjectsBySlug)) {
        if (!coveredSubjects.has(subject.slug)) {
            const versioning = getSubjectVersioning(subject);

            /**
             * Legacy subjects may be hidden from the generated public catalog
             * when catalog.meta.versioning.hideLegacyByDefault is true.
             *
             * They still exist as routable subjects and keep their progress by
             * subjectSlug, but they do not need to appear in the default catalog.
             */
            if (versioning.status === "legacy") {
                continue;
            }

            throw new Error(
                `Subject "${subject.slug}" has catalogSlug "${subject.catalogSlug}" but no catalog manifest includes it`,
            );
        }
    }

    const entryLines = entries.map((entry) => {
        const catalog = {
            slug: entry.slug,
            order: Number(entry.manifest.catalog?.order ?? 0),
            title: String(entry.manifest.catalog?.title ?? entry.slug),
            description:
                typeof entry.manifest.catalog?.description === "string"
                    ? entry.manifest.catalog.description
                    : null,
            imagePublicId:
                typeof entry.manifest.catalog?.imagePublicId === "string"
                    ? entry.manifest.catalog.imagePublicId
                    : null,
            imageAlt:
                typeof entry.manifest.catalog?.imageAlt === "string"
                    ? entry.manifest.catalog.imageAlt
                    : null,
            defaultSubjectSlug: entry.defaultSubjectSlug,
            status: entry.manifest.catalog?.status ?? "active",
            subjectSlugs: entry.subjectSlugs,
            meta: entry.manifest.catalog?.meta ?? null,
        };

        return `  ${JSON.stringify(entry.slug)}: ${JSON.stringify(
            { catalog },
            null,
            2,
        ).replace(/\n/g, "\n  ")},`;
    });

    const catalogBySubjectLines = Object.values(subjectsBySlug)
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map(
            (subject) =>
                `  ${JSON.stringify(subject.slug)}: ${JSON.stringify(
                    subject.catalogSlug,
                )},`,
        );

    const fileContents = `/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:catalog-manifests

import type { CatalogManifest } from "@/lib/subjects/_core/subjectManifestTypes";

export const CATALOG_MANIFESTS: Record<string, CatalogManifest> = {
${entryLines.join("\n")}
};

export const SUBJECT_CATALOG_SLUGS: Record<string, string> = {
${catalogBySubjectLines.join("\n")}
};
`;

    await writeTextFile(outputFile, fileContents);
    console.log(`Generated ${relFromProject(outputFile)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});