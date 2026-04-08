#!/usr/bin/env node

// scripts/generate-subject-manifests.ts

import path from "node:path";
import {
    projectRoot,
    exists,
    getDirectories,
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
    };
};

async function main() {
    const subjectDirs = await getDirectories(subjectsRoot);

    const subjectEntries: Array<{
        slug: string;
        importName: string;
        importPath: string;
    }> = [];

    for (const subjectName of subjectDirs) {
        if (subjectName.startsWith("_")) continue;

        const subjectDir = path.join(subjectsRoot, subjectName);
        const manifestFile = path.join(subjectDir, "subject.manifest.json");

        if (!(await exists(manifestFile))) continue;

        const json = await readJsonFile<SubjectManifestJson>(manifestFile);
        const manifestSlug = String(json.subject?.slug ?? subjectName);

        if (json.subject?.slug && json.subject.slug !== subjectName) {
            throw new Error(
                `subject slug mismatch in ${manifestFile}\n` +
                `- folder name: ${subjectName}\n` +
                `- json subject.slug: ${json.subject.slug}`,
            );
        }

        subjectEntries.push({
            slug: manifestSlug,
            importName: toSafeIdentifier(manifestSlug, "subjectManifest", "s"),
            importPath: `./${subjectName}/subject.manifest.json`,
        });
    }

    assertUnique(
        subjectEntries.map((x) => x.slug),
        "subject slug",
        outputFile,
    );

    const importLines = subjectEntries.map(
        (entry) => `import ${entry.importName} from "${entry.importPath}";`,
    );

    const mapLines = subjectEntries.map(
        (entry) =>
            `  ${JSON.stringify(entry.slug)}: ${entry.importName} as SubjectManifest,`,
    );

    const fileContents = `/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";
${importLines.length ? `\n${importLines.join("\n")}\n` : ""}

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
${mapLines.join("\n")}
};
`;

    await writeTextFile(outputFile, fileContents);
    console.log(`Generated ${relFromProject(outputFile)}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});