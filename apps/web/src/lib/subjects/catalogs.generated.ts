/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:catalog-manifests

import type { CatalogManifest } from "@/lib/subjects/_core/subjectManifestTypes";

export const CATALOG_MANIFESTS: Record<string, CatalogManifest> = {
  "python": {
    "catalog": {
      "slug": "python",
      "order": 10,
      "title": "Python",
      "description": "Python learning paths from first steps through larger projects, deeper problem solving, and more advanced programming patterns.",
      "imagePublicId": "Screenshot_2026-02-03_at_1.19.20_AM_kdnlpk",
      "imageAlt": "Python catalog cover",
      "defaultSubjectSlug": "python",
      "status": "active",
      "subjectSlugs": [
        "python"
      ],
      "meta": {
        "family": "programming",
        "featured": true
      }
    }
  },
  "sql": {
    "catalog": {
      "slug": "sql",
      "order": 20,
      "title": "SQL",
      "description": "SQL courses focused on querying, reporting, data modeling, and practical database thinking.",
      "imagePublicId": null,
      "imageAlt": "SQL catalog cover",
      "defaultSubjectSlug": "sql",
      "status": "active",
      "subjectSlugs": [
        "sql"
      ],
      "meta": {
        "family": "data"
      }
    }
  },
};

export const SUBJECT_CATALOG_SLUGS: Record<string, string> = {
  "python": "python",
  "sql": "sql",
};
