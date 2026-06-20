import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");
const DEFAULT_SUBJECT_ROOT = path.resolve(
  REPO_ROOT,
  ".curriculum-drafts/python/subjects/python--python-data-functions--draft",
);

function getSubjectRoot() {
  const input = process.argv[2]?.trim();
  if (!input) return DEFAULT_SUBJECT_ROOT;
  return path.resolve(process.cwd(), input);
}

function walkFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getProjectSteps(card) {
  if (!card || typeof card !== "object") return [];
  return card.project?.steps ?? card.spec?.steps ?? [];
}

function main() {
  const subjectRoot = getSubjectRoot();

  if (!fs.existsSync(subjectRoot)) {
    console.error(`Subject root not found: ${subjectRoot}`);
    process.exit(1);
  }

  const bundleFiles = walkFiles(subjectRoot).filter((filePath) =>
    filePath.endsWith("topic.bundle.json"),
  );

  if (bundleFiles.length === 0) {
    console.error(`No topic.bundle.json files found under ${subjectRoot}`);
    process.exit(1);
  }

  const issues = [];

  for (const filePath of bundleFiles) {
    const bundle = readJson(filePath);
    const topicId = String(bundle?.topicId ?? "").trim() || "unknown-topic";
    const exerciseIds = new Set(
      (Array.isArray(bundle?.exercises) ? bundle.exercises : [])
        .map((exercise) => String(exercise?.id ?? "").trim())
        .filter(Boolean),
    );

    const cards = Array.isArray(bundle?.cards) ? bundle.cards : [];
    for (const card of cards) {
      const cardKind = String(card?.kind ?? card?.type ?? "").trim();
      if (cardKind !== "project") continue;

      const steps = getProjectSteps(card);
      if (!Array.isArray(steps) || steps.length === 0) {
        issues.push(
          `${topicId}/${String(card?.id ?? "project")} has no project steps`,
        );
        continue;
      }

      for (const step of steps) {
        const stepId = String(step?.id ?? "").trim() || "unknown-step";
        const exerciseKey = String(step?.exerciseKey ?? "").trim();

        if (!exerciseKey) {
          issues.push(
            `${topicId}/${String(card?.id ?? "project")} step "${stepId}" is missing exerciseKey`,
          );
          continue;
        }

        if (!exerciseIds.has(exerciseKey)) {
          issues.push(
            `${topicId}/${String(card?.id ?? "project")} step "${stepId}" points to missing exerciseKey "${exerciseKey}"`,
          );
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error("Curriculum project manifest integrity audit failed:\n");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `Curriculum project manifest integrity audit passed for ${path.relative(REPO_ROOT, subjectRoot) || subjectRoot}.`,
  );
}

main();
