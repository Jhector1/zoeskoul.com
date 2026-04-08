/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";

import python from "./python/subject.manifest.json";
import sql from "./sql/subject.manifest.json";


export const SUBJECT_MANIFESTS = {
  "python": python,
  "sql": sql,
} satisfies Record<string, SubjectManifest>;
