import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const suites = [
  {
    marker: "ZOEBUILD_APP_TESTS",
    args: ["--filter", "@zoeskoul/zoebuild", "test"],
    minimumFiles: 295,
    minimumTests: 1_354,
  },
  {
    marker: "ZOEBUILD_RUNNER_TESTS",
    args: ["--filter", "@zoeskoul/runner", "test"],
    minimumFiles: 81,
    minimumTests: 314,
  },
  {
    marker: "ZOEBUILD_PACKAGE_TESTS",
    args: [
      "exec",
      "vitest",
      "run",
      "packages/build-ai",
      "packages/build-application",
      "packages/build-contracts",
      "packages/build-core",
      "packages/build-executor-contracts",
      "packages/build-imports",
      "packages/build-materializer",
      "packages/build-preparation",
      "packages/build-registry",
      "packages/build-routing",
      "packages/build-template-registry",
    ],
    minimumFiles: 43,
    minimumTests: 128,
  },
];

const failed = [];

for (const suite of suites) {
  console.log(`\n${suite.marker}_START`);
  const result = spawnSync("pnpm", suite.args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const skipped = /^\s*(?:Test Files|Tests)\s+.*\bskipped\b.*$/m.test(output);
  const fileCount = Number(output.match(/Test Files\s+(\d+) passed/)?.[1] ?? 0);
  const testCount = Number(output.match(/^\s*Tests\s+(\d+) passed/m)?.[1] ?? 0);
  const incompleteDiscovery =
    fileCount < suite.minimumFiles || testCount < suite.minimumTests;

  if (result.error || result.status !== 0 || skipped || incompleteDiscovery) {
    console.error(`${suite.marker}_FAIL`);
    if (result.error) console.error(result.error.message);
    if (skipped) console.error(`${suite.marker} reported skipped tests.`);
    if (incompleteDiscovery) {
      console.error(
        `${suite.marker} discovered ${fileCount} files/${testCount} tests; ` +
        `expected at least ${suite.minimumFiles} files/${suite.minimumTests} tests.`,
      );
    }
    failed.push(suite.marker);
  } else {
    console.log(`${suite.marker}_PASS`);
  }
}

if (failed.length > 0) {
  console.error(`ZOEBUILD_CANONICAL_TESTS_FAIL: ${failed.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("ZOEBUILD_CANONICAL_TESTS_PASS");
}
