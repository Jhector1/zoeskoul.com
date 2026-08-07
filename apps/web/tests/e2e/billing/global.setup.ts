import fs from "node:fs/promises";
import {
  execFileSync,
} from "node:child_process";

import { encode } from "next-auth/jwt";

const COOKIE_NAME = "authjs.session-token";
const USER_MARKER = "__ZOESKOUL_BILLING_E2E_USER__=";

type SeededUser = {
  id: string;
  email: string;
  name: string | null;
};

function seededUserFrom(output: string): SeededUser {
  const line = output
    .split(/\r?\n/)
    .find((item) => item.startsWith(USER_MARKER));

  if (!line) {
    throw new Error(
      "Billing E2E seed helper did not return its user marker.\n" +
        output,
    );
  }

  const value = JSON.parse(
    line.slice(USER_MARKER.length),
  ) as Partial<SeededUser>;

  if (
    typeof value.id !== "string" ||
    typeof value.email !== "string"
  ) {
    throw new Error("Billing E2E seed user is invalid.");
  }

  return {
    id: value.id,
    email: value.email,
    name:
      typeof value.name === "string"
        ? value.name
        : null,
  };
}

export default async function globalSetup() {
  const authSecret =
    process.env.E2E_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  const storageStatePath =
    process.env.E2E_BILLING_STORAGE_STATE;
  const userStatePath =
    process.env.E2E_BILLING_USER_STATE;

  if (!authSecret) {
    throw new Error("E2E_AUTH_SECRET is required.");
  }
  if (!storageStatePath || !userStatePath) {
    throw new Error(
      "Billing E2E state paths are required.",
    );
  }

  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "tests/e2e/billing/seed-user.ts",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  const user = seededUserFrom(output);

  const maxAge = 4 * 60 * 60;
  const expires =
    Math.floor(Date.now() / 1000) + maxAge;

  const sessionToken = await encode({
    secret: authSecret,
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

  await fs.writeFile(
    userStatePath,
    JSON.stringify(user, null, 2) + "\n",
    "utf8",
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
