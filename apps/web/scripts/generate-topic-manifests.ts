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
    moduleSlug?: string;
};

type SubjectManifestJson = {
    modules?: Array<{
        slug?: string;
        sections?: Array<{
            topics?: string[];
        }>;
    }>;
};

async function buildSubjectRegistry(
    subjectDir: string,
    opts?: { requiredTopicId?: string | null },
) {
    const subjectManifestFile = path.join(subjectDir, "subject.manifest.json");
    if (!(await exists(subjectManifestFile))) return;

    const modulesDir = path.join(subjectDir, "modules");
    if (!(await exists(modulesDir))) return;

    const subjectManifest = await readJsonFile<SubjectManifestJson>(subjectManifestFile);
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
    const bundlesByModuleAndTopic = new Map<string, typeof topicEntries[number]>();
    const duplicateBundleKeys = new Set<string>();
    const manifestModules = subjectManifest.modules ?? [];

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
        const moduleDirName = path.basename(
            path.dirname(path.dirname(path.dirname(file))),
        );
        const legacyModuleIndexMatch = /^module(\d+)$/.exec(moduleDirName);
        const derivedModuleSlug = legacyModuleIndexMatch
            ? manifestModules[Number(legacyModuleIndexMatch[1])]?.slug
            : null;
        const moduleSlug =
            typeof json.moduleSlug === "string" && json.moduleSlug.length > 0
                ? json.moduleSlug
                : derivedModuleSlug ?? null;

        if (!moduleSlug) {
            throw new Error(
                `Missing moduleSlug in ${file} and could not derive it from ${subjectManifestFile}`,
            );
        }

        const key = `${moduleSlug}::${topicId}`;
        if (bundlesByModuleAndTopic.has(key)) {
            duplicateBundleKeys.add(key);
        }

        bundlesByModuleAndTopic.set(key, {
            topicId,
            rawImportName: `${safe}Json`,
            typedImportName: safe,
            importPath: toPosixImportPath(outputDir, file),
        });
    }

    if (duplicateBundleKeys.size > 0) {
        throw new Error(
            `Duplicate topic bundle entries found while generating ${outputFile}: ${Array.from(duplicateBundleKeys).sort().join(", ")}`,
        );
    }

    const referencedTopics = (subjectManifest.modules ?? []).flatMap((module) =>
        (module.sections ?? []).flatMap((section) =>
            (section.topics ?? []).map((topicId) => ({
                moduleSlug: String(module.slug ?? ""),
                topicId,
            })),
        ),
    );

    assertUnique(
        referencedTopics.map((entry) => entry.topicId),
        "topicId",
        `${subjectManifestFile} referenced topics`,
    );

    for (const referencedTopic of referencedTopics) {
        const entry = bundlesByModuleAndTopic.get(
            `${referencedTopic.moduleSlug}::${referencedTopic.topicId}`,
        );

        if (!entry) {
            throw new Error(
                `Topic "${referencedTopic.topicId}" for module "${referencedTopic.moduleSlug}" was not found under ${subjectDir}.`,
            );
        }

        topicEntries.push(entry);
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
