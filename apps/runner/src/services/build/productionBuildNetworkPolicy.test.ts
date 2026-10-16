import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildProductionBuildContainerOptions,
} from "./executeProductionBuild.js";

describe(
  "trusted production build network policy",
  () => {
    it(
      "allows registry networking only for frozen dependency installation",
      () => {
        const install =
          buildProductionBuildContainerOptions({
            workspaceDir:
              "/tmp/zoebuild-install",

            command: [
              "pnpm",
              "install",
              "--frozen-lockfile",
            ],

            step:
              "install",
          });

        expect(
          install
            .HostConfig
            .NetworkMode,
        ).toBe(
          "bridge",
        );
      },
    );

    it(
      "disables outbound networking while generated project code builds",
      () => {
        const build =
          buildProductionBuildContainerOptions({
            workspaceDir:
              "/tmp/zoebuild-build",

            command: [
              "pnpm",
              "build",
            ],

            step:
              "build",
          });

        expect(
          build
            .HostConfig
            .NetworkMode,
        ).toBe(
          "none",
        );

        expect(
          build.Cmd,
        ).toEqual([
          "pnpm",
          "build",
        ]);

        expect(
          build.Tty,
        ).toBe(false);

        expect(
          build.AttachStdin,
        ).toBe(false);
      },
    );
  },
);
