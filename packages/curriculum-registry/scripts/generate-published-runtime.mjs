#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

const publishedRoot = path.join(packageRoot, "published");
const subjectsRoot = path.join(publishedRoot, "subjects");
const messagesRoot = path.join(publishedRoot, "messages");
const outputRoot = path.join(packageRoot, "src", "runtime", "generated");
const authoringCatalogsRoot = path.join(repoRoot, "authoring", "catalogs");

function die(message) {
  throw new Error(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root, predicate) {
  if (!(await exists(root))) return [];

  const out = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(root, entry.name);

    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, predicate)));
    } else if (entry.isFile() && predicate(full, entry.name)) {
      out.push(full);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function deepMerge(base, override) {
  const out = { ...(base ?? {}) };

  for (const [key, value] of Object.entries(override ?? {})) {
    const previous = out[key];

    if (
      previous &&
      value &&
      typeof previous === "object" &&
      !Array.isArray(previous) &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = deepMerge(previous, value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function safeLocaleName(locale) {
  return locale.replace(/[^a-zA-Z0-9_]/g, "_");
}

function jsonLiteral(value) {
  return JSON.stringify(value, null, 2);
}

function moduleSlugForPhysicalDir(manifest, moduleDir) {
  const match = /^module(\d+)$/.exec(moduleDir);
  if (!match) return moduleDir;

  const index = Number(match[1]);
  const module = (manifest.modules ?? [])[index];

  return String(module?.slug ?? moduleDir);
}

function subjectVersion(subject) {
  const raw = subject?.manifest?.subject?.meta?.versioning?.version;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function subjectVersionFamily(subject) {
  return String(
    subject?.manifest?.subject?.meta?.versioning?.family ??
      subject?.manifest?.subject?.slug ??
      subject?.slug ??
      "",
  );
}

function pickCurrentSubject(subjects) {
  return (
    [...subjects].sort(
      (a, b) =>
        subjectVersion(b) - subjectVersion(a) ||
        Number(a.order ?? 0) - Number(b.order ?? 0) ||
        a.slug.localeCompare(b.slug),
    )[0] ?? null
  );
}

function catalogVersioning(catalog) {
  return (
    catalog?.catalog?.meta?.versioning ??
    catalog?.catalog?.versioning ??
    catalog?.meta?.versioning ??
    {}
  );
}

async function generateSubjects() {
  const manifestFiles = await walkFiles(
    subjectsRoot,
    (_full, name) => name === "subject.manifest.json",
  );

  if (manifestFiles.length === 0) {
    die(`No canonical subject.manifest.json files found under ${subjectsRoot}`);
  }

  const manifests = {};
  const topicMaps = {};
  const genKeys = {};
  const subjectRecords = {};

  for (const manifestFile of manifestFiles) {
    const manifest = await readJson(manifestFile);
    const subjectDir = path.dirname(manifestFile);
    const folderName = path.basename(subjectDir);

    const slug = String(manifest?.subject?.slug ?? folderName).trim();
    const genKey = String(manifest?.subject?.genKey ?? "").trim();
    const catalogSlug = String(
      manifest?.subject?.catalogSlug ??
        manifest?.subject?.slug ??
        folderName,
    ).trim();

    if (!slug) die(`Missing subject slug in ${manifestFile}`);

    if (manifest?.subject?.slug && manifest.subject.slug !== folderName) {
      die(
        `Subject slug mismatch in ${manifestFile}: ` +
          `folder=${folderName}, subject.slug=${manifest.subject.slug}`,
      );
    }

    if (!genKey) die(`Missing subject.genKey in ${manifestFile}`);
    if (manifests[slug]) die(`Duplicate canonical subject slug: ${slug}`);

    const bundleFiles = await walkFiles(
      subjectDir,
      (_full, name) => name === "topic.bundle.json",
    );

    const bundlesByModuleAndTopic = new Map();
    const topicIdOccurrences = new Map();

    for (const bundleFile of bundleFiles) {
      const bundle = await readJson(bundleFile);
      const topicFolder = path.basename(path.dirname(bundleFile));
      const physicalModuleDir = path.basename(
        path.dirname(path.dirname(path.dirname(bundleFile))),
      );

      const topicId = String(bundle?.topicId ?? topicFolder).trim();
      const moduleSlug = String(
        bundle?.moduleSlug ??
          moduleSlugForPhysicalDir(manifest, physicalModuleDir),
      ).trim();

      if (!topicId) die(`Missing topicId in ${bundleFile}`);

      if (bundle?.topicId && bundle.topicId !== topicFolder) {
        die(
          `Topic folder mismatch in ${bundleFile}: ` +
            `folder=${topicFolder}, topicId=${bundle.topicId}`,
        );
      }

      const key = `${moduleSlug}::${topicId}`;

      if (bundlesByModuleAndTopic.has(key)) {
        die(`Duplicate canonical topic mapping ${key} in subject ${slug}`);
      }

      bundlesByModuleAndTopic.set(key, bundle);

      const seen = topicIdOccurrences.get(topicId) ?? [];
      seen.push(key);
      topicIdOccurrences.set(topicId, seen);
    }

    const referencedTopicIds = new Set();
    const topicManifests = {};

    for (const module of manifest.modules ?? []) {
      const moduleSlug = String(module?.slug ?? "").trim();
      if (!moduleSlug) {
        die(`Subject ${slug} has a module without slug`);
      }

      for (const section of module.sections ?? []) {
        for (const rawTopicId of section?.topics ?? []) {
          const topicId = String(rawTopicId).trim();
          if (!topicId) continue;

          if (referencedTopicIds.has(topicId)) {
            die(
              `Duplicate manifest topic id "${topicId}" in subject ${slug}; ` +
                `runtime maps require unique topic ids.`,
            );
          }

          referencedTopicIds.add(topicId);

          const key = `${moduleSlug}::${topicId}`;
          const bundle = bundlesByModuleAndTopic.get(key);

          if (!bundle) {
            const candidates = topicIdOccurrences.get(topicId) ?? [];

            die(
              `Subject ${slug} references missing canonical bundle ${key}. ` +
                `Candidates for topic id: ${candidates.join(", ") || "(none)"}`,
            );
          }

          topicManifests[topicId] = bundle;
        }
      }
    }

    manifests[slug] = manifest;
    topicMaps[slug] = topicManifests;
    genKeys[slug] = genKey;

    subjectRecords[slug] = {
      slug,
      catalogSlug,
      order: Number(manifest?.subject?.order ?? 0),
      status: manifest?.subject?.status ?? "active",
      manifest,
    };
  }

  const uniqueGenKeys = [...new Set(Object.values(genKeys))].sort();

  const genKeyType = uniqueGenKeys.length
    ? uniqueGenKeys.map((value) => JSON.stringify(value)).join(" | ")
    : "never";

  const subjectsTs = `/* eslint-disable */
// AUTO-GENERATED FROM packages/curriculum-registry/published.
// Do not edit manually.
// Run: pnpm --filter @zoeskoul/curriculum-registry generate

export type GeneratedSubjectGenKey = ${genKeyType};

export type GeneratedSubjectSource = {
  subjectSlug: string;
  genKey: GeneratedSubjectGenKey;
  manifest: any;
  topicManifests: Record<string, any>;
};

export const SUBJECT_MANIFESTS: Record<string, any> = ${jsonLiteral(manifests)};

const TOPIC_MANIFESTS_BY_SUBJECT: Record<string, Record<string, any>> =
  ${jsonLiteral(topicMaps)};

const GEN_KEY_BY_SUBJECT: Record<string, GeneratedSubjectGenKey> =
  ${jsonLiteral(genKeys)};

export const SUBJECT_GENERATOR_SOURCES: Record<string, GeneratedSubjectSource> =
  Object.fromEntries(
    Object.keys(SUBJECT_MANIFESTS).sort().map((subjectSlug) => [
      subjectSlug,
      {
        subjectSlug,
        genKey: GEN_KEY_BY_SUBJECT[subjectSlug] as GeneratedSubjectGenKey,
        manifest: SUBJECT_MANIFESTS[subjectSlug],
        topicManifests: TOPIC_MANIFESTS_BY_SUBJECT[subjectSlug] ?? {},
      },
    ]),
  );

export const SUBJECT_GENERATOR_SOURCES_BY_GENKEY: Record<
  GeneratedSubjectGenKey,
  GeneratedSubjectSource[]
> = Object.fromEntries(
  (${jsonLiteral(uniqueGenKeys)} as GeneratedSubjectGenKey[]).map((genKey) => [
    genKey,
    Object.values(SUBJECT_GENERATOR_SOURCES).filter(
      (source) => source.genKey === genKey,
    ),
  ]),
) as Record<GeneratedSubjectGenKey, GeneratedSubjectSource[]>;
`;

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "subjects.ts"),
    subjectsTs,
    "utf8",
  );

  return subjectRecords;
}

async function generateCatalogs(subjectRecords) {
  const catalogFiles = await walkFiles(
    authoringCatalogsRoot,
    (_full, name) => name.endsWith(".catalog.json"),
  );

  if (catalogFiles.length === 0) {
    die(`No authoring catalogs found under ${authoringCatalogsRoot}`);
  }

  const catalogs = {};
  const subjectCatalogSlugs = {};

  for (const catalogFile of catalogFiles) {
    const source = await readJson(catalogFile);
    const slug = String(source?.catalog?.slug ?? "").trim();

    if (!slug) die(`Missing catalog.slug in ${catalogFile}`);
    if (catalogs[slug]) die(`Duplicate catalog slug ${slug}`);

    const subjectsForCatalog = Object.values(subjectRecords)
      .filter((subject) => subject.catalogSlug === slug)
      .sort(
        (a, b) =>
          Number(a.order) - Number(b.order) ||
          a.slug.localeCompare(b.slug),
      );

    let subjectSlugs;

    if (
      Array.isArray(source?.catalog?.subjectSlugs) &&
      source.catalog.subjectSlugs.length
    ) {
      subjectSlugs = source.catalog.subjectSlugs.map((value) => String(value));
    } else if (catalogVersioning(source)?.hideLegacyByDefault === true) {
      const groups = new Map();

      for (const subject of subjectsForCatalog) {
        const family = subjectVersionFamily(subject);
        if (!groups.has(family)) groups.set(family, []);
        groups.get(family).push(subject);
      }

      subjectSlugs = [...groups.values()]
        .map((group) => pickCurrentSubject(group))
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.order) - Number(b.order) ||
            a.slug.localeCompare(b.slug),
        )
        .map((subject) => subject.slug);
    } else {
      subjectSlugs = subjectsForCatalog.map((subject) => subject.slug);
    }

    if (!subjectSlugs.length) {
      die(`Catalog ${slug} resolved zero subjects`);
    }

    for (const subjectSlug of subjectSlugs) {
      if (!subjectRecords[subjectSlug]) {
        die(
          `Catalog ${slug} references unknown canonical subject ${subjectSlug}`,
        );
      }
      subjectCatalogSlugs[subjectSlug] = slug;
    }

    let defaultSubjectSlug = String(
      source?.catalog?.defaultSubjectSlug ?? "",
    ).trim();

    if (!defaultSubjectSlug) {
      const groups = new Map();

      for (const subject of subjectsForCatalog) {
        const family = subjectVersionFamily(subject);
        if (!groups.has(family)) groups.set(family, []);
        groups.get(family).push(subject);
      }

      defaultSubjectSlug =
        [...groups.values()]
          .map((group) => pickCurrentSubject(group))
          .filter(Boolean)
          .sort(
            (a, b) =>
              Number(a.order) - Number(b.order) ||
              a.slug.localeCompare(b.slug),
          )[0]?.slug ??
        subjectSlugs[0] ??
        "";
    }

    if (!subjectSlugs.includes(defaultSubjectSlug)) {
      die(
        `Catalog ${slug} defaultSubjectSlug ${defaultSubjectSlug} ` +
          `is not in its canonical subjectSlugs`,
      );
    }

    catalogs[slug] = {
      ...source,
      catalog: {
        ...(source.catalog ?? {}),
        subjectSlugs,
        defaultSubjectSlug,
      },
    };
  }

  for (const subject of Object.values(subjectRecords)) {
    if (!subjectCatalogSlugs[subject.slug]) {
      if (!catalogs[subject.catalogSlug]) {
        die(
          `Canonical subject ${subject.slug} maps to missing catalog ` +
            `${subject.catalogSlug}`,
        );
      }

      subjectCatalogSlugs[subject.slug] = subject.catalogSlug;
    }
  }

  const catalogsTs = `/* eslint-disable */
// AUTO-GENERATED FROM authoring/catalogs + canonical published subjects.
// Do not edit manually.

export const CATALOG_MANIFESTS: Record<string, any> =
  ${jsonLiteral(catalogs)};

export const SUBJECT_CATALOG_SLUGS: Record<string, string> =
  ${jsonLiteral(subjectCatalogSlugs)};
`;

  await fs.writeFile(
    path.join(outputRoot, "catalogs.ts"),
    catalogsTs,
    "utf8",
  );
}

async function generateMessages() {
  const locales = (await fs.readdir(messagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (!locales.length) {
    die(`No canonical message locales found under ${messagesRoot}`);
  }

  const loaderRows = [];

  for (const locale of locales) {
    const localeSubjectsRoot = path.join(messagesRoot, locale, "subjects");
    const files = await walkFiles(
      localeSubjectsRoot,
      (_full, name) => name.endsWith(".json"),
    );

    let merged = {};

    for (const file of files) {
      merged = deepMerge(merged, await readJson(file));
    }

    const safe = safeLocaleName(locale);

    await fs.writeFile(
      path.join(outputRoot, `messages.${safe}.ts`),
      `/* eslint-disable */
// AUTO-GENERATED canonical curriculum messages for ${locale}.
const messages: Record<string, any> = ${jsonLiteral(merged)};
export default messages;
`,
      "utf8",
    );

    loaderRows.push(
      `  ${JSON.stringify(locale)}: () => ` +
        `import("./messages.${safe}.js").then(` +
        `(module) => module.default as Record<string, any>),`,
    );
  }

  await fs.writeFile(
    path.join(outputRoot, "messages.ts"),
    `/* eslint-disable */
// AUTO-GENERATED canonical curriculum message loader.

const loaders: Record<
  string,
  () => Promise<Record<string, any>>
> = {
${loaderRows.join("\n")}
};

export async function loadCurriculumLocaleMessages(
  locale: string,
): Promise<Record<string, any>> {
  const loader = loaders[locale];
  return loader ? loader() : {};
}

export const AVAILABLE_CURRICULUM_MESSAGE_LOCALES =
  ${jsonLiteral(locales)} as const;
`,
    "utf8",
  );
}

async function main() {
  if (!(await exists(subjectsRoot))) {
    die(`Missing canonical subjects root: ${subjectsRoot}`);
  }

  if (!(await exists(messagesRoot))) {
    die(`Missing canonical messages root: ${messagesRoot}`);
  }

  const subjectRecords = await generateSubjects();
  await generateCatalogs(subjectRecords);
  await generateMessages();

  console.log(
    `Generated canonical curriculum runtime for ` +
      `${Object.keys(subjectRecords).length} subjects.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
