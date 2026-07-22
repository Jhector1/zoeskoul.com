import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupDraftSubject, pathExists, safeJoin, subjectWithoutDraftWrapper, writeDraftJsonFile } from "./fs";

const temporaryRoots: string[] = [];
const originalDraftRoot = process.env.DEV_CURRICULUM_DRAFT_ROOT;

async function createDraftRoot() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-curriculum-drafts-"));
  const draftRoot = path.join(repoRoot, ".curriculum-drafts");
  await fs.mkdir(draftRoot, { recursive: true });
  temporaryRoots.push(repoRoot);
  process.env.DEV_CURRICULUM_DRAFT_ROOT = draftRoot;
  return { repoRoot, draftRoot };
}

afterEach(async () => {
  if (originalDraftRoot === undefined) {
    delete process.env.DEV_CURRICULUM_DRAFT_ROOT;
  } else {
    process.env.DEV_CURRICULUM_DRAFT_ROOT = originalDraftRoot;
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

  it("writes the current draft directly without creating an automatic backup", async () => {
    const { repoRoot, draftRoot } = await createDraftRoot();
    const filePath = path.join(draftRoot, "git", "subjects", "git--git-foundations--draft", "subject.json");

    const result = await writeDraftJsonFile({ filePath, value: { title: "Git Foundations" } });

    await expect(fs.readFile(filePath, "utf8")).resolves.toBe('{\n  "title": "Git Foundations"\n}\n');
    expect(result).toEqual({
      path: ".curriculum-drafts/git/subjects/git--git-foundations--draft/subject.json",
    });
    await expect(pathExists(path.join(repoRoot, ".curriculum-backups"))).resolves.toBe(false);
  });

  it("creates a manual subject backup with authored files and messages", async () => {
    const { repoRoot, draftRoot } = await createDraftRoot();
    const subject = "git--git-foundations--draft";
    const subjectFile = path.join(draftRoot, "git", "subjects", subject, "subject.manifest.json");
    const messageFile = path.join(draftRoot, "git", "messages", "en", "subjects", subject, "subject.json");
    await fs.mkdir(path.dirname(subjectFile), { recursive: true });
    await fs.mkdir(path.dirname(messageFile), { recursive: true });
    await fs.writeFile(subjectFile, '{"slug":"git-foundations"}\n', "utf8");
    await fs.writeFile(messageFile, '{"title":"Git Foundations"}\n', "utf8");

    const backup = await backupDraftSubject({ catalog: "git", subject, locale: "en" });
    const backupRoot = path.join(repoRoot, backup.backupRoot);

    expect(backup.backupRoot).toMatch(/^\.curriculum-backups\/dev-editor\//);
    expect(backup.paths).toHaveLength(2);
    await expect(
      fs.readFile(path.join(backupRoot, ".curriculum-drafts", "git", "subjects", subject, "subject.manifest.json"), "utf8"),
    ).resolves.toBe('{"slug":"git-foundations"}\n');
    await expect(
      fs.readFile(path.join(backupRoot, ".curriculum-drafts", "git", "messages", "en", "subjects", subject, "subject.json"), "utf8"),
    ).resolves.toBe('{"title":"Git Foundations"}\n');
  });
});
