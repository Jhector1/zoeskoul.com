import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  process.cwd();

function read(
  relative: string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "restricted Build production route ownership",
  () => {
    it(
      "parses the shared contract before invoking the trusted production executor",
      () => {
        const source =
          read(
            "src/routes/build.jobs.productionBuild.ts",
          );

        expect(
          source,
        ).toContain(
          "parseTrustedBuildJobRequest",
        );

        expect(
          source,
        ).toContain(
          'request.operation !==\n          "production-build"',
        );

        expect(
          source,
        ).toContain(
          "executeProductionBuild",
        );

        expect(
          source,
        ).not.toContain(
          "createContainer(",
        );
      },
    );

    it(
      "is registered only after global service authentication",
      () => {
        const app =
          read(
            "src/app.ts",
          );

        const auth =
          app.indexOf(
            "app.use(requireServiceAuth)",
          );

        const route =
          app.indexOf(
            'app.post("/build/jobs/production-build", executeBuildProductionRoute);',
          );

        expect(
          auth,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          route,
        ).toBeGreaterThan(
          auth,
        );
      },
    );

    it(
      "introduces no PTY, terminal, browser command, or websocket boundary",
      () => {
        const source =
          read(
            "src/routes/build.jobs.productionBuild.ts",
          ).toLowerCase();

        expect(
          source,
        ).not.toContain(
          "pty",
        );

        expect(
          source,
        ).not.toContain(
          "/sessions/start",
        );

        expect(
          source,
        ).not.toContain(
          "websocket",
        );

        expect(
          source,
        ).not.toContain(
          "child_process",
        );
      },
    );
  },
);
