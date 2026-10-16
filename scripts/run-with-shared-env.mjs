import {
  readFileSync,
} from "node:fs";

import {
  spawn,
} from "node:child_process";

import {
  dirname,
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

const scriptDirectory =
  dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const repositoryRoot =
  resolve(
    scriptDirectory,
    "..",
  );

const sharedEnvPath =
  resolve(
    repositoryRoot,
    ".env.shared.local",
  );

function unquote(
  rawValue,
) {
  const value =
    rawValue.trim();

  if (
    value.length >= 2 &&
    (
      (
        value.startsWith('"') &&
        value.endsWith('"')
      ) ||
      (
        value.startsWith("'") &&
        value.endsWith("'")
      )
    )
  ) {
    return value.slice(
      1,
      -1,
    );
  }

  return value;
}

function loadSharedEnv() {
  let text;

  try {
    text =
      readFileSync(
        sharedEnvPath,
        "utf8",
      );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        "Missing .env.shared.local. "
        + "Create it from .env.shared.example.",
      );
    }

    throw error;
  }

  for (
    const rawLine
    of text.split(/\r?\n/)
  ) {
    let line =
      rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    if (
      line.startsWith(
        "export ",
      )
    ) {
      line =
        line
          .slice(
            "export ".length,
          )
          .trimStart();
    }

    const separator =
      line.indexOf("=");

    if (
      separator <= 0
    ) {
      continue;
    }

    const key =
      line
        .slice(
          0,
          separator,
        )
        .trim();

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/
        .test(key)
    ) {
      continue;
    }

    /*
     * Explicit shell / CI / deployment environment wins.
     */
    if (
      process.env[key] !== undefined
    ) {
      continue;
    }

    process.env[key] =
      unquote(
        line.slice(
          separator + 1,
        ),
      );
  }
}

loadSharedEnv();

const [
  command,
  ...args
] = process.argv.slice(2);

if (!command) {
  console.error(
    "Usage: node scripts/run-with-shared-env.mjs "
    + "<command> [...args]",
  );

  process.exit(2);
}

const child =
  spawn(
    command,
    args,
    {
      stdio: "inherit",
      env: process.env,
      shell:
        process.platform ===
        "win32",
    },
  );

child.on(
  "error",
  (error) => {
    console.error(
      `Unable to start ${command}: ${error.message}`,
    );

    process.exit(1);
  },
);

child.on(
  "exit",
  (
    code,
    signal,
  ) => {
    if (signal) {
      process.kill(
        process.pid,
        signal,
      );

      return;
    }

    process.exit(
      code ?? 1,
    );
  },
);
