import {
  resolve,
} from "node:path";

import {
  bootstrapStudentAuth,
} from "../browser/authBootstrap.js";

const args = process.argv
  .slice(2)
  .filter(
    (arg) => arg !== "--",
  );

function readFlag(
  name: string,
): string | undefined {
  const index =
    args.indexOf(name);

  return index >= 0
    ? args[index + 1]
    : undefined;
}

function defaultApiOrigin(
  startUrl: string,
): string {
  const url =
    new URL(startUrl);

  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return `${url.protocol}//${url.hostname}:3000`;
  }

  if (
    url.hostname ===
    "student.zoeskoul.com"
  ) {
    return "https://zoeskoul.com";
  }

  throw new Error(
    "Could not infer ZoeSkoul Web/API origin. Pass --api-origin explicitly.",
  );
}

const startUrl =
  readFlag("--url");

if (!startUrl) {
  console.error(
    [
      "Usage:",
      "  pnpm curriculum:agent:student:auth -- --url <student-url> [--api-origin <web-origin>] [--state <path>]",
      "",
      "A headed browser opens and stays open until ZoeSkoul confirms authenticated Student access.",
    ].join("\n"),
  );

  process.exitCode = 2;
} else {
  const repoRoot =
    resolve(
      process.cwd(),
      "../..",
    );

  const storageStatePath =
    resolve(
      readFlag("--state") ??
        resolve(
          repoRoot,
          ".curriculum-reviews",
          "auth",
          "student.storage-state.json",
        ),
    );

  const apiOrigin =
    readFlag("--api-origin") ??
    defaultApiOrigin(startUrl);

  bootstrapStudentAuth({
    startUrl,
    apiOrigin,
    storageStatePath,
  }).catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.stack ??
            error.message
          : String(error),
      );

      process.exitCode = 1;
    },
  );
}
