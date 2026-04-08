#!/usr/bin/env node
// scripts/generate-topic-manifests.ts

import path from "node:path";
import {
    projectRoot,
    exists,
    getDirectories,
    walkFiles,
    readJsonFile,
    toSafeIdentifier,
    toPosixImportPath,
    assertUnique,
    readFlag,
    writeTextFile,
    relFromProject,
} from "./_shared/generator-common";

const subjectsRoot = path.join(projectRoot, "src", "lib", "subjects");

type TopicBundleJson = {
    topicId?: string;
};

async function buildSubjectRegistry(
    subjectDir: string,
    opts?: { requiredTopicId?: string | null },
) {
    const subjectManifestFile = path.join(subjectDir, "subject.manifest.json");
    if (!(await exists(subjectManifestFile))) return;

    const modulesDir = path.join(subjectDir, "modules");
    if (!(await exists(modulesDir))) return;

    const topicBundleFiles = await walkFiles(
        modulesDir,
        (_full, name) => name === "topic.bundle.json",
    );

    const outputFile = path.join(subjectDir, "topics.generated.ts");
    const outputDir = path.dirname(outputFile);

    const topicEntries: Array<{
        topicId: string;
        rawImportName: string;
        typedImportName: string;
        importPath: string;
    }> = [];

    for (const file of topicBundleFiles) {
        const json = await readJsonFile<TopicBundleJson>(file);
        const folderTopicId = path.basename(path.dirname(file));
        const topicId = String(json.topicId ?? folderTopicId);

        if (json.topicId && json.topicId !== folderTopicId) {
            throw new Error(
                `topicId mismatch in ${file}\n` +
                `- folder name: ${folderTopicId}\n` +
                `- json topicId: ${json.topicId}`,
            );
        }

        const safe = toSafeIdentifier(topicId, "topicManifest", "t");

        topicEntries.push({
            topicId,
            rawImportName: `${safe}Json`,
            typedImportName: safe,
            importPath: toPosixImportPath(outputDir, file),
        });
    }

    assertUnique(
        topicEntries.map((x) => x.topicId),
        "topicId",
        outputFile,
    );

    if (opts?.requiredTopicId) {
        const found = topicEntries.some((x) => x.topicId === opts.requiredTopicId);
        if (!found) {
            throw new Error(
                `Topic "${opts.requiredTopicId}" was not found under ${subjectDir}.`,
            );
        }
    }

    const importLines = topicEntries.map(
        (entry) => `import ${entry.rawImportName} from "${entry.importPath}";`,
    );

    const castLines = topicEntries.map(
        (entry) =>
            `const ${entry.typedImportName} = ${entry.rawImportName} as SlimTopicManifest;`,
    );

    const mapLines = topicEntries.map(
        (entry) => `  ${JSON.stringify(entry.topicId)}: ${entry.typedImportName},`,
    );

    const fileContents = `/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:topic-manifests

import type {
  SlimTopicManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";
${importLines.length ? `\n${importLines.join("\n")}\n` : ""}
${castLines.length ? `\n${castLines.join("\n")}\n` : ""}
export const TOPIC_MANIFESTS: TopicManifestRefMap = {
${mapLines.join("\n")}
};
`;

    await writeTextFile(outputFile, fileContents);
    console.log(`Generated ${relFromProject(outputFile)}`);
}

async function main() {
    const onlySubject = readFlag("subject");
    const onlyTopic = readFlag("topic");

    const subjectDirs = await getDirectories(subjectsRoot);

    for (const subjectName of subjectDirs) {
        if (subjectName.startsWith("_")) continue;
        if (onlySubject && subjectName !== onlySubject) continue;

        const subjectDir = path.join(subjectsRoot, subjectName);
        await buildSubjectRegistry(subjectDir, {
            requiredTopicId: onlyTopic,
        });
    }

    if (onlySubject) {
        const subjectDir = path.join(subjectsRoot, onlySubject);
        if (!(await exists(subjectDir))) {
            throw new Error(
                `Subject folder "${onlySubject}" does not exist under ${subjectsRoot}`,
            );
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});