#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  projectRoot,
  repositoryRoot,
  walkFiles,
} from "./generatorCommon.js";

const generatedBasenames = new Set([
  "messages.generated.ts",
  "subjects.generated.ts",
  "catalogs.generated.ts",
  "topics.generated.ts",
]);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const generatorScripts = [
  "generateI18nManifest.js",
  "generateTopicManifests.js",
  "generateSubjectManifests.js",
  "generateCatalogManifests.js",
] as const;

async function copyDirectoryWithoutGeneratedFiles(
  source: string,
  destination: string,
): Promise<void> {
  await fs.cp(source, destination, {
    recursive: true,
    filter: (currentSource) =>
      !generatedBasenames.has(path.basename(currentSource)),
  });
}

async function runGenerator(
  scriptName: string,
  temporaryAppRoot: string,
): Promise<void> {
  const scriptPath = path.join(moduleDir, scriptName);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "--app-root", temporaryAppRoot],
      {
        cwd: repositoryRoot,
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${scriptName} failed during registry check ` +
            `(code=${String(code)}, signal=${String(signal)})`,
        ),
      );
    });
  });
}

async function collectGeneratedFiles(appRoot: string): Promise<string[]> {
  const roots = [
    path.join(appRoot, "src", "i18n"),
    path.join(appRoot, "src", "lib", "subjects"),
  ];
  const files: string[] = [];

  for (const root of roots) {
    try {
      files.push(
        ...(await walkFiles(root, (_fullPath, entryName) =>
          generatedBasenames.has(entryName),
        )),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return files
    .map((file) => path.relative(appRoot, file).replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b));
}

export async function compareGeneratedArtifacts(args: {
  expectedAppRoot: string;
  generatedAppRoot: string;
}): Promise<string[]> {
  const expectedFiles = await collectGeneratedFiles(args.expectedAppRoot);
  const generatedFiles = await collectGeneratedFiles(args.generatedAppRoot);
  const allFiles = Array.from(
    new Set([...expectedFiles, ...generatedFiles]),
  ).sort((a, b) => a.localeCompare(b));
  const differences: string[] = [];

  for (const relativeFile of allFiles) {
    const expectedFile = path.join(args.expectedAppRoot, relativeFile);
    const generatedFile = path.join(args.generatedAppRoot, relativeFile);
    const expectedExists = expectedFiles.includes(relativeFile);
    const generatedExists = generatedFiles.includes(relativeFile);

    if (!expectedExists) {
      differences.push(`missing committed artifact: ${relativeFile}`);
      continue;
    }

    if (!generatedExists) {
      differences.push(`obsolete committed artifact: ${relativeFile}`);
      continue;
    }

    const [expected, generated] = await Promise.all([
      fs.readFile(expectedFile),
      fs.readFile(generatedFile),
    ]);

    if (!expected.equals(generated)) {
      differences.push(`stale committed artifact: ${relativeFile}`);
    }
  }

  return differences;
}

export async function checkGeneratedArtifacts(): Promise<void> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zoeskoul-curriculum-registry-check-"),
  );
  const temporaryAppRoot = path.join(temporaryRoot, "apps", "web");

  try {
    await copyDirectoryWithoutGeneratedFiles(
      path.join(projectRoot, "src", "i18n", "messages"),
      path.join(temporaryAppRoot, "src", "i18n", "messages"),
    );
    await copyDirectoryWithoutGeneratedFiles(
      path.join(projectRoot, "src", "lib", "subjects"),
      path.join(temporaryAppRoot, "src", "lib", "subjects"),
    );
    await fs.cp(
      path.join(repositoryRoot, "authoring", "catalogs"),
      path.join(temporaryRoot, "authoring", "catalogs"),
      { recursive: true },
    );

    for (const scriptName of generatorScripts) {
      await runGenerator(scriptName, temporaryAppRoot);
    }

    const differences = await compareGeneratedArtifacts({
      expectedAppRoot: projectRoot,
      generatedAppRoot: temporaryAppRoot,
    });

    if (differences.length > 0) {
      throw new Error(
        [
          "Generated curriculum artifacts are stale.",
          ...differences.map((difference) => `- ${difference}`),
          "",
          "Run: pnpm curr:generate-registries",
        ].join("\n"),
      );
    }

    console.log("Curriculum registry artifacts are current.");
  } finally {
    await fs.rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
}

function isMainModule(): boolean {
  const entryFile = process.argv[1];
  return Boolean(
    entryFile &&
      path.resolve(entryFile) === fileURLToPath(import.meta.url),
  );
}

if (isMainModule()) {
  checkGeneratedArtifacts().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
