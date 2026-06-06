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
      "imagePublicId": "bee933f4-cfee-44ae-9c5e-7d7b90b2f63a",
      "imageAlt": "Python catalog cover",
      "defaultSubjectSlug": "python-v2",
      "status": "active",
      "subjectSlugs": [
        "python",
        "python-v2",
        "python-data-functions",
        "applied-python-projects"
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
      "defaultSubjectSlug": "sql-v2",
      "status": "active",
      "subjectSlugs": [
        "sql",
        "sql-v2"
      ],
      "meta": {
        "family": "data"
      }
    }
  },
};

export const SUBJECT_CATALOG_SLUGS: Record<string, string> = {
  "applied-python-projects": "python",
  "python": "python",
  "python-data-functions": "python",
  "python-v2": "python",
  "sql": "sql",
  "sql-v2": "sql",
};
