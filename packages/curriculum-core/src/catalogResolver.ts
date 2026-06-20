import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "./repoPaths.js";

type CatalogManifest = {
    catalog?: {
        slug?: unknown;
        subjectSlugs?: unknown;
    };
};

type CatalogSlugIndex = {
    catalogBySubjectSlug: Map<string, string>;
    catalogSlugs: string[];
};

let cachedIndex: CatalogSlugIndex | null = null;

function readCatalogIndex(): CatalogSlugIndex {
    const catalogsRoot = path.join(getRepoRoot(), "authoring", "catalogs");
    const entries = fs
        .readdirSync(catalogsRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".catalog.json"))
        .sort((a, b) => a.name.localeCompare(b.name));

    const catalogBySubjectSlug = new Map<string, string>();
    const catalogSlugs: string[] = [];

    for (const entry of entries) {
        const filePath = path.join(catalogsRoot, entry.name);
        const manifest = JSON.parse(
            fs.readFileSync(filePath, "utf8"),
        ) as CatalogManifest;
        const catalogSlug = String(manifest.catalog?.slug ?? "").trim();

        if (!catalogSlug) {
            throw new Error(`Missing catalog.slug in ${filePath}`);
        }

        catalogSlugs.push(catalogSlug);

        const subjectSlugs = Array.isArray(manifest.catalog?.subjectSlugs)
            ? manifest.catalog.subjectSlugs
            : [];

        for (const value of subjectSlugs) {
            const subjectSlug = String(value ?? "").trim();

            if (!subjectSlug) {
                throw new Error(
                    `Catalog "${catalogSlug}" in ${filePath} contains an empty subject slug`,
                );
            }

            const existing = catalogBySubjectSlug.get(subjectSlug);
            if (existing && existing !== catalogSlug) {
                throw new Error(
                    `Subject "${subjectSlug}" is owned by both "${existing}" and "${catalogSlug}"`,
                );
            }

            catalogBySubjectSlug.set(subjectSlug, catalogSlug);
        }
    }

    return {
        catalogBySubjectSlug,
        catalogSlugs,
    };
}

function getCatalogIndex() {
    cachedIndex ??= readCatalogIndex();
    return cachedIndex;
}

function getCatalogSlugForDraftSubjectSlug(subjectSlug: string): string | null {
    if (!subjectSlug.endsWith("--draft")) {
        return null;
    }

    const slugPrefix = subjectSlug.split("--")[0]?.trim();
    if (!slugPrefix) {
        return null;
    }

    if (getCatalogIndex().catalogSlugs.includes(slugPrefix)) {
        return slugPrefix;
    }

    return getCatalogIndex().catalogBySubjectSlug.get(slugPrefix) ?? null;
}

export function getCatalogSlugForSubjectSlug(subjectSlug: string): string {
    const normalizedSubjectSlug = String(subjectSlug ?? "").trim();
    const catalogSlug =
        getCatalogIndex().catalogBySubjectSlug.get(normalizedSubjectSlug) ??
        getCatalogSlugForDraftSubjectSlug(normalizedSubjectSlug);

    if (catalogSlug) {
        return catalogSlug;
    }

    const knownCatalogs = getCatalogIndex().catalogSlugs.join(", ") || "(none)";
    throw new Error(
        `No catalog owns subject "${normalizedSubjectSlug}". Checked authoring/catalogs/*.catalog.json. Known catalogs: ${knownCatalogs}`,
    );
}

export function clearCatalogSlugResolverCacheForTests() {
    cachedIndex = null;
}
