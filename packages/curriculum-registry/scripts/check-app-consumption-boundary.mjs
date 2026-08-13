#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");

const roots = [
  path.join(repoRoot, "apps", "web", "src"),
  path.join(repoRoot, "apps", "student", "src"),
];

const forbidden = [
  "@/lib/subjects/subjects.generated",
  "@/lib/subjects/catalogs.generated",
];

async function walk(root) {
  const out = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(root, entry.name);

    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".generated.ts")
    ) {
      out.push(full);
    }
  }

  return out;
}

async function walkAllFiles(root) {
  const out = [];

  let entries;

  try {
    entries = await fs.readdir(
      root,
      { withFileTypes: true },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      error.code === "ENOENT"
    ) {
      return out;
    }

    throw error;
  }

  for (const entry of entries) {
    const full =
      path.join(root, entry.name);

    if (entry.isDirectory()) {
      out.push(
        ...(await walkAllFiles(full)),
      );
      continue;
    }

    if (entry.isFile()) {
      out.push(full);
    }
  }

  return out;
}

function relativePosix(file) {
  return path
    .relative(repoRoot, file)
    .split(path.sep)
    .join("/");
}

const violations = [];

for (const root of roots) {
  for (const file of await walk(root)) {
    const source = await fs.readFile(file, "utf8");

    for (const token of forbidden) {
      if (source.includes(token)) {
        violations.push(
          `${path.relative(repoRoot, file)} still imports ${token}`,
        );
      }
    }
  }
}

const studentSrc =
  path.join(
    repoRoot,
    "apps",
    "student",
    "src",
  );

const studentPracticeGenerator =
  path.join(
    studentSrc,
    "legacy-web",
    "lib",
    "practice",
    "generator",
  );

for (
  const file
  of await walkAllFiles(
    studentPracticeGenerator,
  )
) {
  violations.push(
    `${relativePosix(file)} reintroduces a Student-owned curriculum/practice generator`,
  );
}

const studentSubjects =
  path.join(
    studentSrc,
    "legacy-web",
    "lib",
    "subjects",
  );

const forbiddenPayloadNames =
  new Set([
    "subject.manifest.json",
    "topic.bundle.json",
    "topics.generated.ts",
    "subjects.generated.ts",
    "catalogs.generated.ts",
  ]);

for (
  const file
  of await walkAllFiles(
    studentSubjects,
  )
) {
  if (
    forbiddenPayloadNames.has(
      path.basename(file),
    )
  ) {
    violations.push(
      `${relativePosix(file)} reintroduces generated curriculum payload inside Student`,
    );
  }
}

for (
  const file
  of await walkAllFiles(
    studentSrc,
  )
) {
  const relative =
    relativePosix(file);

  if (
    /^apps\/student\/src\/.*\/messages\/[^/]+\/subjects\//.test(
      relative,
    )
  ) {
    violations.push(
      `${relative} reintroduces a Student-owned curriculum message mirror`,
    );
  }
}

const obsoleteStudentI18nAdapter =
  path.join(
    studentSrc,
    "legacy-web",
    "i18n",
    "messages.generated.ts",
  );

try {
  const stat =
    await fs.stat(
      obsoleteStudentI18nAdapter,
    );

  if (stat.isFile()) {
    violations.push(
      `${relativePosix(obsoleteStudentI18nAdapter)} reintroduces the obsolete Student curriculum i18n adapter`,
    );
  }
} catch (error) {
  if (
    !error ||
    typeof error !== "object" ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

if (violations.length) {
  throw new Error(
    [
      "Application-owned curriculum ownership reappeared.",
      ...violations.map((violation) => `- ${violation}`),
      "",
      "Consume @zoeskoul/curriculum-registry/runtime instead.",
        "Generated curriculum, generators, and curriculum messages must remain package-owned.",
    ].join("\n"),
  );
}

const requiredConsumers = [
  [
    "apps/student/src/subjects/index.ts",
    "@zoeskoul/curriculum-registry/runtime",
  ],
  [
    "apps/student/src/i18n/messages.ts",
    "@zoeskoul/curriculum-registry/runtime",
  ],
  [
    "apps/web/src/lib/subjects/index.ts",
    "@zoeskoul/curriculum-registry/runtime",
  ],
  [
    "apps/web/src/i18n/request.ts",
    "@zoeskoul/curriculum-registry/runtime",
  ],
];

for (const [relative, token] of requiredConsumers) {
  const file = path.join(repoRoot, relative);
  const source = await fs.readFile(file, "utf8");

  if (!source.includes(token)) {
    throw new Error(
      `${relative} no longer consumes ${token}`,
    );
  }
}

console.log(
  "App curriculum consumption boundary passed: Web and Student use the canonical registry runtime.",
);
