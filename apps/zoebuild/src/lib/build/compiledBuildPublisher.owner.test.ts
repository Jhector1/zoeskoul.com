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

const source =
  readFileSync(
    fileURLToPath(
      new URL(
        "./compiledBuildPublisher.ts",
        import.meta.url,
      ),
    ),
    "utf8",
  );

describe(
  "ZoeBuild compiled artifact persistence ownership",
  () => {
    it(
      "keeps source authority separate from compiled artifact bytes",
      () => {
        expect(
          source,
        ).toContain(
          'import "server-only"',
        );

        expect(
          source,
        ).toContain(
          ".buildArtifact",
        );

        expect(
          source,
        ).toContain(
          ".codeProjectRevision",
        );

        expect(
          source,
        ).toContain(
          "publicationSnapshot",
        );

        expect(
          source,
        ).not.toContain(
          ".codeProject.update(",
        );
      },
    );

    it(
      "persists immutable decoded files and points BuildDeployment at the artifact",
      () => {
        expect(
          source,
        ).toContain(
          "buildArtifactId:",
        );

        expect(
          source,
        ).toContain(
          "files: {",
        );

        expect(
          source,
        ).toContain(
          "content:",
        );

        expect(
          source,
        ).toContain(
          "sizeBytes:",
        );

        expect(
          source,
        ).toContain(
          "ZOEBUILD_COMPILED_ARTIFACT_PROVIDER",
        );

        expect(
          source,
        ).toContain(
          "artifactStorage:",
        );
      },
    );

    it(
      "rechecks owner and source version inside the deployment transaction",
      () => {
        expect(
          source,
        ).toContain(
          "ownerId,",
        );

        expect(
          source,
        ).toContain(
          ".currentVersion !==",
        );

        expect(
          source,
        ).toContain(
          "BUILD_PUBLISH_SOURCE_CHANGED",
        );
      },
    );

    it(
      "contains no AI or external object-storage provider calls",
      () => {
        const lower =
          source.toLowerCase();

        expect(
          lower,
        ).not.toContain(
          "openai",
        );

        expect(
          lower,
        ).not.toContain(
          "gemini",
        );

        expect(
          lower,
        ).not.toContain(
          "anthropic",
        );

        expect(
          lower,
        ).not.toContain(
          "s3client",
        );

        expect(
          lower,
        ).not.toContain(
          "putobjectcommand",
        );

        expect(
          lower,
        ).not.toContain(
          "fetch(",
        );
      },
    );
  },
);
