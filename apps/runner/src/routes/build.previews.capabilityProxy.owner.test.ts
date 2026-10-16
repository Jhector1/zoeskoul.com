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
  relative: string,
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
  "React preview opaque-iframe capability transport",
  () => {
    it(
      "puts a 192-bit random capability inside the registered Vite base path",
      () => {
        const runtime =
          source(
            "../services/build/reactPreviewRuntime.ts",
          );

        expect(runtime).toContain(
          "randomBytes",
        );

        expect(runtime).toMatch(
          /randomBytes\(\s*24,\s*\)/,
        );

        expect(runtime).toContain(
          '"base64url"',
        );

        expect(runtime).toContain(
          "/content/${encodeURIComponent(",
        );

        expect(runtime).toContain(
          "fetchReactPreviewHttpByCapability",
        );
      },
    );

    it(
      "keeps capability fetch behind global runner service auth",
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
            'app.post("/build/previews/:previewId/proxy-fetch"',
          ),
        );
      },
    );

    it(
      "keeps actor ownership on the original fetch route while the internal proxy route uses only capability authorization",
      () => {
        const owned =
          source(
            "./build.previews.fetch.ts",
          );

        const proxy =
          source(
            "./build.previews.proxyFetch.ts",
          );

        expect(owned).toContain(
          "getRequiredActorKey",
        );

        expect(proxy).toContain(
          "fetchReactPreviewHttpByCapability",
        );

        expect(proxy).not.toContain(
          "getRequiredActorKey",
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
          expect(proxy).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "still publishes no Vite host port and keeps the dev container offline",
      () => {
        const runtime =
          source(
            "../services/build/reactPreviewRuntime.ts",
          );

        expect(runtime).toMatch(
          /NetworkMode\s*:\s*"none"/,
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
      },
    );
  },
);
