import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  readFileSync,
} from "node:fs";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildProductionBuildContainerOptions,
  readProductionBuildArtifact,
} from "./executeProductionBuild.js";

const roots:
  string[] = [];

afterEach(
  async () => {
    await Promise.all(
      roots
        .splice(0)
        .map(
          (root) =>
            fs.rm(
              root,
              {
                recursive:
                  true,
                force:
                  true,
              },
            ),
        ),
    );
  },
);

describe(
  "trusted React production build executor",
  () => {
    it(
      "uses direct argv in the dedicated non-interactive build sandbox",
      () => {
        const options =
          buildProductionBuildContainerOptions({
            workspaceDir:
              "/workspaces/build-test",

            command: [
              "pnpm",
              "build",
            ],

            step:
              "build",
          });

        expect(
          options.Cmd,
        ).toEqual([
          "pnpm",
          "build",
        ]);

        expect(
          options.AttachStdin,
        ).toBe(false);

        expect(
          options.Tty,
        ).toBe(false);

        expect(
          options.OpenStdin,
        ).toBe(false);

        expect(
          options.Labels[
            "com.zoeskoul.runner.purpose"
          ],
        ).toBe(
          "production-build",
        );

        expect(
          options.Labels[
            "com.zoeskoul.runner.profile"
          ],
        ).toBe(
          "build-production-react-vite-v1",
        );

        expect(
          options.HostConfig,
        ).toMatchObject({
          ReadonlyRootfs:
            true,

          Privileged:
            false,

          CapDrop: [
            "ALL",
          ],

          SecurityOpt: [
            "no-new-privileges:true",
          ],
        });

        expect(
          options
            .HostConfig
            .Binds
            .join(" "),
        ).not.toContain(
          "docker.sock",
        );
      },
    );

    it(
      "captures only bounded dist output as base64",
      async () => {
        const root =
          await fs.mkdtemp(
            path.join(
              os.tmpdir(),
              "zoebuild-production-artifact-",
            ),
          );

        roots.push(
          root,
        );

        await fs.mkdir(
          path.join(
            root,
            "dist",
            "assets",
          ),
          {
            recursive:
              true,
          },
        );

        await fs.writeFile(
          path.join(
            root,
            "dist",
            "index.html",
          ),
          "<h1>Hello</h1>",
        );

        await fs.writeFile(
          path.join(
            root,
            "dist",
            "assets",
            "app.bin",
          ),
          Buffer.from([
            0,
            255,
            10,
          ]),
        );

        const artifact =
          await readProductionBuildArtifact(
            root,
          );

        expect(
          artifact,
        ).toMatchObject({
          type:
            "static-directory",

          outputPath:
            "dist",

          totalBytes:
            17,
        });

        expect(
          artifact.sha256,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        const binary =
          artifact.files.find(
            (file) =>
              file.path ===
              "assets/app.bin",
          );

        expect(
          binary,
        ).toEqual({
          path:
            "assets/app.bin",

          encoding:
            "base64",

          data:
            Buffer.from([
              0,
              255,
              10,
            ]).toString(
              "base64",
            ),
        });
      },
    );

    it(
      "owns two one-shot steps, cleanup, and no shell or PTY",
      () => {
        const source =
          readFileSync(
            new URL(
              "./executeProductionBuild.ts",
              import.meta.url,
            ),
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "plan.installCommand",
        );

        expect(
          source,
        ).toContain(
          "plan.buildCommand",
        );

        expect(
          source,
        ).toContain(
          "cleanupWorkspaceNow",
        );

        expect(
          source,
        ).toMatch(
          /container\s*\.remove/,
        );

        expect(
          source,
        ).not.toContain(
          "child_process",
        );

        expect(
          source,
        ).not.toContain(
          "shell:",
        );

        expect(
          source,
        ).not.toContain(
          "pty-runner",
        );
      },
    );
  },
);
