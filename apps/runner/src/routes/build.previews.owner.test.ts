import {
  readFileSync,
} from "node:fs";

import {
  fileURLToPath,
} from "node:url";

import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relative:
    string,
) {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "trusted React/Vite preview runner boundary",
  () => {
    it(
      "registers preview only behind global runner service auth",
      () => {
        const app =
          source(
            "../app.ts",
          );

        expect(
          app.indexOf(
            "app.use(requireServiceAuth)",
          ),
        ).toBeLessThan(
          app.indexOf(
            'app.post("/build/previews/start"',
          ),
        );

        expect(app).toContain(
          "/build/previews/:previewId/sync",
        );

        expect(app).toContain(
          "/build/previews/:previewId/fetch",
        );

        expect(app).toContain(
          "/build/previews/:previewId/cancel",
        );
      },
    );

    it(
      "derives commands from the registered plan and publishes no Docker host port",
      () => {
        const runtime =
          source(
            "../services/build/reactPreviewRuntime.ts",
          );

        expect(runtime).toContain(
          "resolveRegisteredReactPreviewServerPlan",
        );

        expect(runtime).toContain(
          "buildProductionBuildContainerOptions",
        );

        expect(runtime).toContain(
          'NetworkMode:\n            "none"',
        );

        expect(runtime).not.toContain(
          "PortBindings",
        );

        expect(runtime).not.toContain(
          "ExposedPorts",
        );

        expect(runtime).not.toContain(
          "PublishAllPorts",
        );

        expect(runtime).toContain(
          '"http://127.0.0.1:5173"',
        );
      },
    );

    it(
      "never accepts browser-selected command, shell, image, env, network or port controls",
      () => {
        const combined = [
          source(
            "./build.previews.start.ts",
          ),
          source(
            "./build.previews.sync.ts",
          ),
          source(
            "./build.previews.fetch.ts",
          ),
          source(
            "./build.previews.cancel.ts",
          ),
        ].join(
          "\n",
        );

        for (
          const forbidden of [
            "req.body.command",
            "req.body.argv",
            "req.body.shell",
            "req.body.image",
            "req.body.env",
            "req.body.network",
            "req.body.port",
          ]
        ) {
          expect(
            combined,
          ).not.toContain(
            forbidden,
          );
        }

        expect(combined).toContain(
          "getRequiredActorKey",
        );

        expect(combined).toContain(
          "parseTrustedBuildJobRequest",
        );
      },
    );

    it(
      "preserves installed dependencies during source sync and fails closed on dependency changes",
      () => {
        const runtime =
          source(
            "../services/build/reactPreviewRuntime.ts",
          );

        expect(runtime).toContain(
          "dependencyFingerprint",
        );

        expect(runtime).toContain(
          "Preview dependencies changed. Restart the preview.",
        );

        expect(runtime).toContain(
          'relPath.startsWith(\n      "node_modules/"',
        );
      },
    );

    it(
      "shares runner capacity limits and owns bounded cleanup",
      () => {
        const runtime =
          source(
            "../services/build/reactPreviewRuntime.ts",
          );

        expect(runtime).toContain(
          "countActiveSessionsForActor",
        );

        expect(runtime).toContain(
          "env.maxConcurrentPerActor",
        );

        expect(runtime).toContain(
          "env.maxConcurrentGlobal",
        );

        expect(runtime).toContain(
          "consumeStartToken",
        );

        expect(runtime).toContain(
          "PREVIEW_IDLE_MS",
        );

        expect(runtime).toContain(
          "PREVIEW_HARD_LIFETIME_MS",
        );

        expect(runtime).toContain(
          "runReactPreviewCleanupSweep",
        );

        expect(runtime).toContain(
          "cleanupWorkspaceNow",
        );
      },
    );
  },
);
