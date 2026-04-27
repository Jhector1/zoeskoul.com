/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";

import python from "./python/subject.manifest.json";
import pythonForBeginners from "./python-for-beginners/subject.manifest.json";
import sql from "./sql/subject.manifest.json";


export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "python": python as SubjectManifest,
  "python-for-beginners": pythonForBeginners as SubjectManifest,
  "sql": sql as SubjectManifest,
};
