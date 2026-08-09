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

if (violations.length) {
  throw new Error(
    [
      "Application-owned curriculum runtime imports reappeared.",
      ...violations.map((violation) => `- ${violation}`),
      "",
      "Consume @zoeskoul/curriculum-registry/runtime instead.",
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
