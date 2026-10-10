import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupDraftSubject, pathExists, safeJoin, subjectWithoutDraftWrapper, writeDraftJsonFile } from "./fs";

const temporaryRoots: string[] = [];
const originalBuildRoot = process.env.DEV_CURRICULUM_BUILD_ROOT;

async function createDraftRoot() {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zoeskoul-curriculum-drafts-"),
  );
  const buildRoot = path.join(repoRoot, ".curriculum-build");
  const draftRoot = path.join(repoRoot, ".curriculum-drafts");

  await fs.mkdir(buildRoot, { recursive: true });
  await fs.mkdir(draftRoot, { recursive: true });

  process.env.DEV_CURRICULUM_BUILD_ROOT = buildRoot;

  return { repoRoot, buildRoot, draftRoot };
}

afterEach(async () => {
  if (originalBuildRoot === undefined) {
    delete process.env.DEV_CURRICULUM_BUILD_ROOT;
  } else {
    process.env.DEV_CURRICULUM_BUILD_ROOT = originalBuildRoot;
  }

  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("curriculum draft fs helpers", () => {
  it("prevents path traversal outside the allowed root", () => {
    const root = path.resolve("/tmp/zoe-drafts");
    expect(safeJoin(root, "python", "subjects")).toBe(path.join(root, "python", "subjects"));
    expect(() => safeJoin(root, "..", "secret.txt")).toThrow(/Unsafe path/);
  });

  it("unwraps catalog draft subject names for course checks", () => {
    expect(subjectWithoutDraftWrapper("python", "python--applied-python-projects--draft")).toBe("applied-python-projects");
    expect(subjectWithoutDraftWrapper("sql", "sql-v2--draft")).toBe("sql-v2");
  });

  it("rejects direct writes to compiled curriculum build artifacts", async () => {
    const { repoRoot, draftRoot } = await createDraftRoot();
    const filePath = path.join(
      draftRoot,
      "git",
      "subjects",
      "git--git-foundations--draft",
      "subject.json",
    );

    await expect(
      writeDraftJsonFile({
        filePath,
        value: { title: "Git Foundations" },
      }),
    ).rejects.toThrow(
      /Compiled curriculum build artifacts are read-only/,
    );

    await expect(pathExists(filePath)).resolves.toBe(false);
    await expect(
      pathExists(path.join(repoRoot, ".curriculum-backups")),
    ).resolves.toBe(false);
  })

  it("creates a manual canonical source backup", async () => {
    const { repoRoot } = await createDraftRoot();
    const subject = "git-foundations";
    const topicFile = path.join(
      repoRoot,
      ".curriculum-drafts",
      "git",
      "subjects",
      subject,
      "courses",
      "git-foundations",
      "topics",
      "module-1",
      "intro.json",
    );

    await fs.mkdir(path.dirname(topicFile), { recursive: true });
    await fs.writeFile(topicFile, '{"title":"Intro"}\n', "utf8");

    const backup = await backupDraftSubject({
      catalog: "git",
      subject,
      locale: "en",
    });
    const backupRoot = path.join(repoRoot, backup.backupRoot);

    expect(backup.backupRoot).toMatch(/^\.curriculum-backups\/dev-editor\//);
    expect(backup.paths).toHaveLength(1);
    await expect(
      fs.readFile(
        path.join(
          backupRoot,
          ".curriculum-drafts",
          "git",
          "subjects",
          subject,
          "courses",
          "git-foundations",
          "topics",
          "module-1",
          "intro.json",
        ),
        "utf8",
      ),
    ).resolves.toBe('{"title":"Intro"}\n');
  })
});
