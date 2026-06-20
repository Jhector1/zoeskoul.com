#!/usr/bin/env node

// scripts/generate-subject-manifests.ts

import path from "node:path";
import {
    findSubjectManifestFiles,
    getSubjectRelativeDir,
    projectRoot,
    readJsonFile,
    toSafeIdentifier,
    assertUnique,
    writeTextFile,
    relFromProject,
} from "./_shared/generator-common";

const subjectsRoot = path.join(projectRoot, "src", "lib", "subjects");
const outputFile = path.join(subjectsRoot, "subjects.generated.ts");

type SubjectManifestJson = {
    subject?: {
        slug?: string;
        genKey?: string;
    };
};

async function main() {
    const manifestFiles = await findSubjectManifestFiles(subjectsRoot);

    const subjectEntries: Array<{
        slug: string;
        genKey: string;
        importName: string;
        topicsImportName: string;
        importPath: string;
        topicsImportPath: string;
    }> = [];

    for (const manifestFile of manifestFiles) {
        const subjectDir = path.dirname(manifestFile);
        const subjectDirRelative = getSubjectRelativeDir(subjectsRoot, manifestFile);
        const json = await readJsonFile<SubjectManifestJson>(manifestFile);
        const folderName = path.basename(subjectDir);
        const manifestSlug = String(json.subject?.slug ?? folderName);
        const genKey = String(json.subject?.genKey ?? "").trim();

        if (json.subject?.slug && json.subject.slug !== folderName) {
            throw new Error(
                `subject slug mismatch in ${manifestFile}\n` +
                `- folder name: ${folderName}\n` +
                `- json subject.slug: ${json.subject.slug}`,
            );
        }

        if (!genKey) {
            throw new Error(`Missing subject.genKey in ${manifestFile}`);
        }

        subjectEntries.push({
            slug: manifestSlug,
            genKey,
            importName: toSafeIdentifier(manifestSlug, "subjectManifest", "s"),
            topicsImportName: toSafeIdentifier(`${manifestSlug}_topic_manifests`, "topicManifests", "t"),
            importPath: `./${subjectDirRelative}/subject.manifest.json`,
            topicsImportPath: `./${subjectDirRelative}/topics.generated`,
        });
    }

    assertUnique(
        subjectEntries.map((x) => x.slug),
        "subject slug",
        outputFile,
    );

    if (subjectEntries.length < 1) {
        throw new Error(
            `No nested subject manifests were found under ${subjectsRoot}. Move generated subjects to src/lib/subjects/<catalogSlug>/<subjectSlug>/ before running this generator.`,
        );
    }

    const importLines = subjectEntries.flatMap((entry) => [
        `import ${entry.importName} from "${entry.importPath}";`,
        `import { TOPIC_MANIFESTS as ${entry.topicsImportName} } from "${entry.topicsImportPath}";`,
    ]);

    const mapLines = subjectEntries.map(
        (entry) =>
            `  ${JSON.stringify(entry.slug)}: ${entry.importName} as SubjectManifest,`,
    );

    const uniqueGenKeys = Array.from(new Set(subjectEntries.map((entry) => entry.genKey)));
    const genKeyType =
        uniqueGenKeys.length > 0
            ? uniqueGenKeys.map((genKey) => JSON.stringify(genKey)).join(" | ")
            : "never";

    const sourceLines = subjectEntries.map(
        (entry) => `  ${JSON.stringify(entry.slug)}: {
    subjectSlug: ${JSON.stringify(entry.slug)},
    genKey: ${JSON.stringify(entry.genKey)},
    manifest: ${entry.importName} as SubjectManifest,
    topicManifests: ${entry.topicsImportName} as TopicManifestRefMap,
  },`,
    );

    const sourceByGenKeyLines = uniqueGenKeys.map(
        (genKey) =>
            `  ${JSON.stringify(genKey)}: [${subjectEntries
                .filter((entry) => entry.genKey === genKey)
                .map((entry) => `SUBJECT_GENERATOR_SOURCES[${JSON.stringify(entry.slug)}]`)
                .join(", ")}],`,
    );

    const fileContents = `/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";
${importLines.length ? `\n${importLines.join("\n")}\n` : ""}

export type GeneratedSubjectGenKey = ${genKeyType};

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
${mapLines.join("\n")}
};

export const SUBJECT_GENERATOR_SOURCES: Record<
  string,
  {
    subjectSlug: string;
    genKey: GeneratedSubjectGenKey;
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
  }
> = {
${sourceLines.join("\n")}
};

export const SUBJECT_GENERATOR_SOURCES_BY_GENKEY: Record<
  GeneratedSubjectGenKey,
  Array<(typeof SUBJECT_GENERATOR_SOURCES)[keyof typeof SUBJECT_GENERATOR_SOURCES]>
> = {
${sourceByGenKeyLines.join("\n")}
};
`;

    await writeTextFile(outputFile, fileContents);
    console.log(`Generated ${relFromProject(outputFile)}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
