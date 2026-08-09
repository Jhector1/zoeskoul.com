#!/usr/bin/env node
import {
  CATALOG_MANIFESTS,
  SUBJECT_CATALOG_SLUGS,
  SUBJECT_GENERATOR_SOURCES,
  loadCurriculumLocaleMessages,
} from "../dist/runtime/index.js";

function fail(message) {
  throw new Error(message);
}

function atPath(source, dottedPath) {
  return dottedPath.split(".").reduce((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return value[segment];
  }, source);
}

const subjectSlugs = Object.keys(SUBJECT_GENERATOR_SOURCES).sort();
const catalogSlugs = Object.keys(CATALOG_MANIFESTS).sort();

if (!subjectSlugs.length) {
  fail("Canonical runtime contains zero subjects.");
}

if (!catalogSlugs.length) {
  fail("Canonical runtime contains zero catalogs.");
}

for (const subjectSlug of subjectSlugs) {
  const source = SUBJECT_GENERATOR_SOURCES[subjectSlug];

  if (!source?.manifest?.subject) {
    fail(`Missing manifest for ${subjectSlug}`);
  }

  if (
    !source?.topicManifests ||
    typeof source.topicManifests !== "object"
  ) {
    fail(`Missing topic manifest map for ${subjectSlug}`);
  }

  if (!SUBJECT_CATALOG_SLUGS[subjectSlug]) {
    fail(`Missing catalog mapping for ${subjectSlug}`);
  }

  for (const module of source.manifest.modules ?? []) {
    for (const section of module.sections ?? []) {
      for (const rawTopicId of section.topics ?? []) {
        const topicId = String(rawTopicId);

        if (!source.topicManifests[topicId]) {
          fail(
            `Canonical runtime is missing ` +
              `${subjectSlug}/${module.slug}/${topicId}`,
          );
        }
      }
    }
  }
}

// Strong regression for the release that triggered Phase 1C.
if (SUBJECT_GENERATOR_SOURCES["python-v2"]) {
  const pythonV2 = SUBJECT_GENERATOR_SOURCES["python-v2"];
  const topic = pythonV2.topicManifests["what-python-is"];

  if (!topic) {
    fail("python-v2 is missing what-python-is");
  }

  const exercise = (topic.exercises ?? []).find(
    (item) => item?.id === "sc-python-language",
  );

  if (!exercise) {
    fail("python-v2/what-python-is is missing sc-python-language");
  }

  const messageBase = String(exercise.messageBase ?? "");

  if (!messageBase) {
    fail("sc-python-language is missing messageBase");
  }

  const englishMessages = await loadCurriculumLocaleMessages("en");
  const title = atPath(
    englishMessages,
    `${messageBase}.title`,
  );

  if (typeof title !== "string" || !title.trim()) {
    fail(
      `Canonical English messages do not resolve ${messageBase}.title`,
    );
  }
}

console.log(
  `Canonical curriculum registry check passed: ` +
    `${subjectSlugs.length} subjects, ${catalogSlugs.length} catalogs.`,
);
