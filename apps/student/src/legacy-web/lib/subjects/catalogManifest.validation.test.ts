import { describe, expect, it } from "vitest";

import { CATALOG_MANIFESTS, SUBJECT_CATALOG_SLUGS } from "@zoeskoul/curriculum-registry/runtime";
import { SUBJECT_MANIFESTS } from "@zoeskoul/curriculum-registry/runtime";

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getCatalogEntries() {
    return Object.values(CATALOG_MANIFESTS)
        .map((entry) => entry.catalog)
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

describe("catalog manifest validation", () => {
    it("uses authoring catalog subjectSlugs as the only catalog membership source of truth", () => {
        const seenSubjects = new Map<string, string>();

        for (const catalog of getCatalogEntries()) {
            invariant(
                catalog.subjectSlugs.length > 0,
                `Catalog "${catalog.slug}" must list at least one subjectSlug`,
            );

            invariant(
                !catalog.defaultSubjectSlug ||
                    catalog.subjectSlugs.includes(catalog.defaultSubjectSlug),
                `Catalog "${catalog.slug}" defaultSubjectSlug "${catalog.defaultSubjectSlug}" must be listed in subjectSlugs`,
            );

            const localSeen = new Set<string>();

            for (const subjectSlug of catalog.subjectSlugs) {
                invariant(
                    !localSeen.has(subjectSlug),
                    `Catalog "${catalog.slug}" lists subject "${subjectSlug}" more than once`,
                );
                localSeen.add(subjectSlug);

                const subjectManifest = SUBJECT_MANIFESTS[subjectSlug];
                invariant(
                    subjectManifest,
                    `Catalog "${catalog.slug}" lists missing subject manifest "${subjectSlug}"`,
                );

                const existingCatalog = seenSubjects.get(subjectSlug);
                invariant(
                    !existingCatalog,
                    `Subject "${subjectSlug}" is listed in both catalog "${existingCatalog}" and catalog "${catalog.slug}"`,
                );
                seenSubjects.set(subjectSlug, catalog.slug);

                expect(SUBJECT_CATALOG_SLUGS[subjectSlug]).toBe(catalog.slug);

                const manifestCatalogSlug =
                    subjectManifest.subject.catalogSlug ?? catalog.slug;
                expect(manifestCatalogSlug).toBe(catalog.slug);
            }
        }

        for (const subjectSlug of Object.keys(SUBJECT_MANIFESTS)) {
            invariant(
                seenSubjects.has(subjectSlug),
                `Subject manifest "${subjectSlug}" is not listed in any catalog manifest`,
            );
            expect(SUBJECT_CATALOG_SLUGS[subjectSlug]).toBe(seenSubjects.get(subjectSlug));
        }
    });

    it("keeps catalog subject order in the generated catalog manifest", () => {
        expect(CATALOG_MANIFESTS["python"]?.catalog.subjectSlugs).toEqual([
            "python",
            "python-v2",
            "python-data-functions",
            "applied-python-projects",
        ]);

        expect(CATALOG_MANIFESTS["sql"]?.catalog.subjectSlugs).toEqual([
            "sql",
            "sql-v2",
            "sql-analysis-reporting",
            "multi-table-sql",
            "sql-data-management",
        ]);

        expect(CATALOG_MANIFESTS["linux"]?.catalog.subjectSlugs).toEqual([
            "linux-terminal-fundamentals",
        ]);
    });

    it("publishes Linux and Applied Python as active", () => {
        expect(
            SUBJECT_MANIFESTS["linux-terminal-fundamentals"]?.subject.status,
        ).toBe("active");
        expect(
            SUBJECT_MANIFESTS["applied-python-projects"]?.subject.status,
        ).toBe("active");
    });

    it("has at most one active default per version family", () => {
        const families = new Map<
            string,
            Array<{ slug: string; status: string; defaultForNewEnrollments: boolean }>
        >();

        for (const [subjectSlug, manifest] of Object.entries(SUBJECT_MANIFESTS)) {
            const versioning = manifest.subject.meta?.versioning;
            if (!versioning) continue;

            const entries = families.get(versioning.family) ?? [];
            entries.push({
                slug: subjectSlug,
                status: versioning.status,
                defaultForNewEnrollments:
                    versioning.defaultForNewEnrollments === true,
            });
            families.set(versioning.family, entries);
        }

        for (const [family, entries] of families) {
            const defaults = entries.filter(
                (entry) =>
                    entry.status === "active" && entry.defaultForNewEnrollments,
            );
            invariant(
                defaults.length <= 1,
                `Version family "${family}" has multiple active defaults: ${defaults
                    .map((entry) => entry.slug)
                    .join(", ")}`,
            );
        }
    });
});
