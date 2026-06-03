import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const messagesDir = path.join(root, "messages/en/subjects/python--python-data-functions--draft");
const subjectsDir = path.join(root, "subjects/python--python-data-functions--draft/modules");

const bannedPromptPatterns = [
  /Complete this project step:/,
  /Requirements:/,
  /Keep the existing file names/,
];

const visibleExamplePhrases = [
  "For input `",
  "The output should be exactly",
];

const requiredPromptMentions = [
  { file: "module6/scope-and-local-variables.json", id: "code-q1", includes: ["`total`"] },
  { file: "module6/scope-and-local-variables.json", id: "code-q2", includes: ["`label`"] },
  { file: "module6/scope-and-local-variables.json", id: "code-q3", includes: ["`area`"] },
  { file: "module6/using-imports-and-helper-files.json", id: "q9", includes: ["`tools/names.py`", "`clean_name`", "`tools.names`"] },
  { file: "module6/using-imports-and-helper-files.json", id: "q10", includes: ["`tools/badges.py`", "`make_badge`", "`tools.badges`"] },
  { file: "module6/using-imports-and-helper-files.json", id: "q11", includes: ["`tools/reports.py`", "`mission_report`", "`tools.reports`"] },
  { file: "module7/simple-csv-processing.json", id: "ci-sum-valid-scores", includes: ["`total`"] },
  { file: "module7/simple-csv-processing.json", id: "ci-write-summary-file", includes: ["`valid_rows`", "`total_score`", "`summary.txt`"] },
  { file: "module7/validating-and-cleaning-input.json", id: "ci-clean-row", includes: ["`clean_row(row)`", "`None`"] },
];

function walk(dir, fileName) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, fileName));
    } else if (entry.name === fileName) {
      results.push(full);
    }
  }
  return results;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const messageFiles = walk(messagesDir, ".keep");
messageFiles.length = 0;
for (const moduleDir of fs.readdirSync(messagesDir)) {
  const fullModuleDir = path.join(messagesDir, moduleDir);
  if (!fs.statSync(fullModuleDir).isDirectory()) continue;
  for (const fileName of fs.readdirSync(fullModuleDir)) {
    if (fileName.endsWith(".json")) {
      messageFiles.push(path.join(fullModuleDir, fileName));
    }
  }
}

const promptErrors = [];

for (const file of messageFiles) {
  const data = readJson(file);
  const subject = data.topics["python--python-data-functions--draft"];
  const moduleData = Object.values(subject)[0];
  const topic = Object.values(moduleData)[0];
  const quiz = topic.quiz || {};

  for (const [id, exercise] of Object.entries(quiz)) {
    if (typeof exercise.prompt !== "string") continue;

    for (const pattern of bannedPromptPatterns) {
      if (pattern.test(exercise.prompt)) {
        promptErrors.push(`${path.relative(root, file)} ${id}: banned phrase matched ${pattern}`);
      }
    }
  }
}

for (const check of requiredPromptMentions) {
  const file = path.join(messagesDir, check.file);
  const data = readJson(file);
  const subject = data.topics["python--python-data-functions--draft"];
  const moduleData = Object.values(subject)[0];
  const topic = Object.values(moduleData)[0];
  const exercise = topic.quiz?.[check.id];

  if (!exercise?.prompt) {
    promptErrors.push(`${check.file} ${check.id}: missing prompt`);
    continue;
  }

  for (const expected of check.includes) {
    if (!exercise.prompt.includes(expected)) {
      promptErrors.push(`${check.file} ${check.id}: prompt must mention ${expected}`);
    }
  }
}

const bundleFiles = walk(subjectsDir, "topic.bundle.json");
const bundleErrors = [];

for (const file of bundleFiles) {
  const bundle = readJson(file);

  for (const card of bundle.cards || []) {
    if (card.kind === "project" && card.project?.allowReveal !== true) {
      bundleErrors.push(`${path.relative(root, file)} project ${card.id}: allowReveal must be true`);
    }
  }

  for (const exercise of bundle.exercises || []) {
    if (exercise.kind !== "code_input") continue;
    if (exercise.id.startsWith("try-") && exercise.showExpectedExample !== true) {
      bundleErrors.push(`${path.relative(root, file)} ${exercise.id}: showExpectedExample must be true`);
    }
    if (exercise.showExpectedExample === true) {
      continue;
    }
    const prompt = exercise.prompt ?? "";
    const hasVisibleExamplePhrase = visibleExamplePhrases.some((text) => prompt.includes(text));
    if (hasVisibleExamplePhrase) {
      bundleErrors.push(`${path.relative(root, file)} ${exercise.id}: hidden-example exercise prompt still contains visible example phrasing`);
    }
  }
}

if (promptErrors.length || bundleErrors.length) {
  for (const error of [...promptErrors, ...bundleErrors]) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Prompt audit passed for ${messageFiles.length} message files and ${bundleFiles.length} topic bundles.`);
