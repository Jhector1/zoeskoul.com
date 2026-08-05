import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import { compareGeneratedArtifacts } from "./checkGeneratedArtifacts";

const temporaryRoots: string[] = [];

async function makeAppRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "zoeskoul-registry-comparison-"),
  );
  temporaryRoots.push(root);
  return root;
}

async function writeArtifact(
  appRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const file = path.join(appRoot, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("compareGeneratedArtifacts", () => {
  it("accepts identical generated registries", async () => {
    const expectedAppRoot = await makeAppRoot();
    const generatedAppRoot = await makeAppRoot();
    const artifact = "src/lib/subjects/catalogs.generated.ts";

    await writeArtifact(expectedAppRoot, artifact, "same\n");
    await writeArtifact(generatedAppRoot, artifact, "same\n");

    await expect(
      compareGeneratedArtifacts({
        expectedAppRoot,
        generatedAppRoot,
      }),
    ).resolves.toEqual([]);
  });

  it("reports stale artifact contents", async () => {
    const expectedAppRoot = await makeAppRoot();
    const generatedAppRoot = await makeAppRoot();
    const artifact = "src/i18n/messages.generated.ts";

    await writeArtifact(expectedAppRoot, artifact, "old\n");
    await writeArtifact(generatedAppRoot, artifact, "new\n");

    await expect(
      compareGeneratedArtifacts({
        expectedAppRoot,
        generatedAppRoot,
      }),
    ).resolves.toEqual([
      `stale committed artifact: ${artifact}`,
    ]);
  });

  it("reports missing and obsolete committed artifacts", async () => {
    const expectedAppRoot = await makeAppRoot();
    const generatedAppRoot = await makeAppRoot();
    const obsolete =
      "src/lib/subjects/python/python/topics.generated.ts";
    const missing =
      "src/lib/subjects/sql/sql/topics.generated.ts";

    await writeArtifact(expectedAppRoot, obsolete, "obsolete\n");
    await writeArtifact(generatedAppRoot, missing, "missing\n");

    await expect(
      compareGeneratedArtifacts({
        expectedAppRoot,
        generatedAppRoot,
      }),
    ).resolves.toEqual([
      `obsolete committed artifact: ${obsolete}`,
      `missing committed artifact: ${missing}`,
    ]);
  });
});
