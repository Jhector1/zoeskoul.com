import fs from "node:fs/promises";
import path from "node:path";
import {
  execFileSync,
} from "node:child_process";

import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const COOKIE_NAME = "authjs.session-token";
const USER_EMAIL =
  "playwright.student.runtime@zoeskoul.local";
const USER_MARKER =
  "__ZOESKOUL_E2E_USER__=";

type SeededUser = {
  id: string;
  email: string;
  name: string | null;
};

function readSeededUser(output: string): SeededUser {
  const markerLine = output
    .split(/\r?\n/)
    .find((line) => line.startsWith(USER_MARKER));

  if (!markerLine) {
    throw new Error(
      "The student-runtime seed helper did not return its user marker.\n" +
        output,
    );
  }

  const parsed = JSON.parse(
    markerLine.slice(USER_MARKER.length),
  ) as Partial<SeededUser>;

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.email !== "string"
  ) {
    throw new Error(
      "The student-runtime seed helper returned an invalid user.",
    );
  }

  return {
    id: parsed.id,
    email: parsed.email,
    name:
      typeof parsed.name === "string"
        ? parsed.name
        : null,
  };
}

export default async function globalSetup() {
  const configuredAuthSecret =
    process.env.E2E_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;

  const storageStatePath =
    process.env.E2E_STUDENT_RUNTIME_STORAGE_STATE;

  if (!configuredAuthSecret) {
    throw new Error(
      "E2E_AUTH_SECRET is required for the " +
        "student-runtime Playwright setup.",
    );
  }

  if (!storageStatePath) {
    throw new Error(
      "E2E_STUDENT_RUNTIME_STORAGE_STATE is required.",
    );
  }

  // Load DATABASE_URL and the rest of the local application environment.
  // Preserve the dedicated E2E authentication secret because force-loading
  // .env files can otherwise replace AUTH_SECRET after the Playwright config
  // has already assigned the server secret.
  loadEnvConfig(
    process.cwd(),
    true,
    console,
    true,
  );

  process.env.E2E_AUTH_SECRET =
    configuredAuthSecret;
  process.env.AUTH_SECRET =
    configuredAuthSecret;
  process.env.NEXTAUTH_SECRET =
    configuredAuthSecret;

  const seedOutput = execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "tests/e2e/student-runtime/seed-user.ts",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: [
        "ignore",
        "pipe",
        "inherit",
      ],
    },
  );

  const user = readSeededUser(seedOutput);

  const maxAge = 60 * 60;
  const expires =
    Math.floor(Date.now() / 1000) + maxAge;

  const sessionToken = await encode({
    secret: configuredAuthSecret,
    salt: COOKIE_NAME,
    maxAge,
    token: {
      uid: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      provider: "playwright",
    },
  });

  await fs.mkdir(
    path.dirname(storageStatePath),
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [
          {
            name: COOKIE_NAME,
            value: sessionToken,
            domain: "localhost",
            path: "/",
            expires,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
