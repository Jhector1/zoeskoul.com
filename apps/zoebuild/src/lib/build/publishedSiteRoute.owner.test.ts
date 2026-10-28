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

const routePath =
  fileURLToPath(
    new URL(
      "../../app/sites/[buildProjectId]/[[...path]]/route.ts",
      import.meta.url,
    ),
  );

const source =
  readFileSync(
    routePath,
    "utf8",
  );

describe(
  "ZoeBuild public published-site boundary",
  () => {
    it(
      "serves only the configured isolated published origin and latest ready deployment",
      () => {
        expect(
          source,
        ).toContain(
          "isPublishedSiteOriginRequest",
        );

        expect(
          source,
        ).toContain(
          ".buildDeployment",
        );

        expect(
          source,
        ).toContain(
          'status:\n            "ready"',
        );

        expect(
          source,
        ).toContain(
          "deployedAt:",
        );
      },
    );

    it("does not serve a legacy CodeProjectRevision HTML/JS snapshot", () => {
      expect(source).not.toContain(".codeProjectRevision");
      expect(source).not.toContain("revision.snapshot");
      expect(source).not.toContain("buildPublishedStaticFileMap");
      expect(source).toContain("compiledFile");
    });

    it(
      "serves compiled deployments from immutable BuildArtifact bytes",
      () => {
        expect(
          source,
        ).toContain(
          "ZOEBUILD_COMPILED_ARTIFACT_PROVIDER",
        );

        expect(
          source,
        ).toContain(
          ".buildArtifactFile",
        );

        expect(
          source,
        ).toContain(
          "artifactId_path",
        );

        expect(
          source,
        ).toContain(
          "compiledFile",
        );

        expect(
          source,
        ).toContain(
          "publishedStaticContentType",
        );
      },
    );

    it(
      "loads only compiled path metadata plus the selected file instead of the whole artifact bytes",
      () => {
        expect(
          source,
        ).toContain(
          "availablePaths",
        );

        expect(
          source,
        ).toContain(
          "select: {\n            path: true",
        );

        expect(
          source,
        ).toContain(
          "findUnique",
        );

        expect(
          source,
        ).not.toContain(
          "buildArtifact: {\n            include:",
        );
      },
    );

    it(
      "normalizes binary responses through an ArrayBuffer body",
      () => {
        expect(
          source,
        ).toContain(
          "| ArrayBuffer",
        );

        expect(
          source,
        ).toContain(
          "Uint8Array.from(",
        );
      },
    );
  },
);
