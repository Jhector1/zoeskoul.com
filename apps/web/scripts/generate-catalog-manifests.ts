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
const authoringCatalogsRoot = path.resolve(projectRoot, "..", "..", "authoring", "catalogs");
const outputFile = path.join(subjectsRoot, "catalogs.generated.ts");

type SubjectManifestJson = {
    subject?: {
        slug?: string;
        catalogSlug?: string | null;
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

async function loadSubjectCatalogMap() {
    const subjectDirs = await getDirectories(subjectsRoot);
    const subjectCatalogSlugBySubjectSlug: Record<string, string> = {};

    for (const subjectName of subjectDirs) {
        if (subjectName.startsWith("_")) continue;

        const manifestFile = path.join(subjectsRoot, subjectName, "subject.manifest.json");
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

        subjectCatalogSlugBySubjectSlug[subjectSlug] = catalogSlug;
    }

    return subjectCatalogSlugBySubjectSlug;
}

async function main() {
    const subjectCatalogSlugBySubjectSlug = await loadSubjectCatalogMap();
    const catalogFiles = await walkFiles(
        authoringCatalogsRoot,
        (_fullPath, entryName) => entryName.endsWith(".catalog.json"),
    );

    const entries: Array<{
        slug: string;
        importName: string;
        manifest: CatalogManifestJson;
    }> = [];

    for (const catalogFile of catalogFiles) {
        const manifest = await readJsonFile<CatalogManifestJson>(catalogFile);
        const slug = String(manifest.catalog?.slug ?? "").trim();

        if (!slug) {
            throw new Error(`Missing catalog.slug in ${catalogFile}`);
        }

        const subjectSlugs = manifest.catalog?.subjectSlugs ?? [];
        if (!Array.isArray(subjectSlugs) || subjectSlugs.length === 0) {
            throw new Error(`Catalog "${slug}" must declare at least one subject in ${catalogFile}`);
        }

        assertUnique(subjectSlugs, `subject slug within catalog "${slug}"`, catalogFile);

        const defaultSubjectSlug =
            typeof manifest.catalog?.defaultSubjectSlug === "string"
                ? manifest.catalog.defaultSubjectSlug
                : null;

        if (defaultSubjectSlug && !subjectSlugs.includes(defaultSubjectSlug)) {
            throw new Error(
                `Catalog "${slug}" defaultSubjectSlug "${defaultSubjectSlug}" is not listed in subjectSlugs`,
            );
        }

        for (const subjectSlug of subjectSlugs) {
            const manifestCatalogSlug = subjectCatalogSlugBySubjectSlug[subjectSlug];

            if (!manifestCatalogSlug) {
                throw new Error(
                    `Catalog "${slug}" references unknown subject "${subjectSlug}"`,
                );
            }

            if (manifestCatalogSlug !== slug) {
                throw new Error(
                    `Subject "${subjectSlug}" points to catalog "${manifestCatalogSlug}" but catalog file "${slug}" also claims it`,
                );
            }
        }

        entries.push({
            slug,
            importName: toSafeIdentifier(`${slug}Catalog`, "catalog", "c"),
            manifest,
        });
    }

    assertUnique(
        entries.map((entry) => entry.slug),
        "catalog slug",
        outputFile,
    );

    const coveredSubjects = new Set<string>();
    for (const entry of entries) {
        for (const subjectSlug of entry.manifest.catalog?.subjectSlugs ?? []) {
            if (coveredSubjects.has(subjectSlug)) {
                throw new Error(`Subject "${subjectSlug}" is assigned to more than one catalog`);
            }
            coveredSubjects.add(subjectSlug);
        }
    }

    for (const subjectSlug of Object.keys(subjectCatalogSlugBySubjectSlug)) {
        if (!coveredSubjects.has(subjectSlug)) {
            throw new Error(
                `Subject "${subjectSlug}" has catalogSlug "${subjectCatalogSlugBySubjectSlug[subjectSlug]}" but no catalog manifest includes it`,
            );
        }
    }

    const entryLines = entries.map((entry) => {
        const subjectSlugs = entry.manifest.catalog?.subjectSlugs ?? [];
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
            defaultSubjectSlug:
                typeof entry.manifest.catalog?.defaultSubjectSlug === "string"
                    ? entry.manifest.catalog.defaultSubjectSlug
                    : subjectSlugs[0] ?? null,
            status: entry.manifest.catalog?.status ?? "active",
            subjectSlugs,
            meta: entry.manifest.catalog?.meta ?? null,
        };

        return `  ${JSON.stringify(entry.slug)}: ${JSON.stringify({ catalog }, null, 2).replace(/\n/g, "\n  ")},`;
    });

    const catalogBySubjectLines = Object.entries(subjectCatalogSlugBySubjectSlug)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
            ([subjectSlug, catalogSlug]) =>
                `  ${JSON.stringify(subjectSlug)}: ${JSON.stringify(catalogSlug)},`,
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
