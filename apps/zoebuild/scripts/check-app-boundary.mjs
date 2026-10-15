#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repo = path.resolve(appRoot, "../..");
const sourceRoot = path.join(appRoot, "src");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function isTestFile(file) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(appRoot, "package.json"), "utf8"),
);

if (packageJson.name !== "@zoeskoul/zoebuild") {
  throw new Error("apps/zoebuild must own package @zoeskoul/zoebuild.");
}

const forbidden = [
  "apps/web/",
  "apps/student/",
  "apps/teacher/",
  "apps/admin/",
  "../../web/",
  "../../student/",
  "../../teacher/",
  "../../admin/",
];

for (const file of walk(sourceRoot)) {
  if (!/\.(?:ts|tsx|js|jsx|mjs|css)$/.test(file)) continue;

  // Ownership tests intentionally reference legacy app paths to prove those
  // implementations are absent. Runtime source must never do so.
  if (isTestFile(file)) continue;

  const source = fs.readFileSync(file, "utf8");

  for (const token of forbidden) {
    if (source.includes(token)) {
      throw new Error(
        `ZoeBuild app boundary violation in ${path.relative(repo, file)}: ${token}`,
      );
    }
  }
}

console.log("zoebuild_app_package=PASS");
console.log("zoebuild_runtime_cross_app_source_imports=NONE");
console.log("zoebuild_ownership_tests=EXCLUDED_FROM_RUNTIME_BOUNDARY_SCAN");
console.log("zoebuild_domain=build.zoeskoul.com");
