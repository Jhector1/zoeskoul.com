import {
  describe,
  expect,
  it,
} from "vitest";

import {
  publishedStaticContentType,
  resolvePublishedStaticFile,
  type PublishedStaticFile,
} from "./staticPublishedArtifact";

function available(
  paths:
    readonly string[],
) {
  return new Map<
    string,
    PublishedStaticFile
  >(
    paths.map(
      (path) => [
        path,
        {
          path,
          body: "",
          contentType:
            publishedStaticContentType(
              path,
            ),
        },
      ],
    ),
  );
}

describe(
  "compiled published artifact routing",
  () => {
    it(
      "reuses the canonical static MIME resolver",
      () => {
        expect(
          publishedStaticContentType(
            "index.html",
          ),
        ).toContain(
          "text/html",
        );

        expect(
          publishedStaticContentType(
            "assets/app.js",
          ),
        ).toContain(
          "javascript",
        );

        expect(
          publishedStaticContentType(
            "assets/site.css",
          ),
        ).toContain(
          "text/css",
        );
      },
    );

    it(
      "reuses canonical root and SPA HTML fallback resolution",
      () => {
        const files =
          available([
            "index.html",
            "assets/app.js",
          ]);

        expect(
          resolvePublishedStaticFile(
            files,
            "",
            true,
          )?.path,
        ).toBe(
          "index.html",
        );

        expect(
          resolvePublishedStaticFile(
            files,
            "dashboard",
            true,
          )?.path,
        ).toBe(
          "index.html",
        );
      },
    );

    it(
      "does not fall back to index for missing non-HTML assets",
      () => {
        const files =
          available([
            "index.html",
          ]);

        expect(
          resolvePublishedStaticFile(
            files,
            "assets/missing.js",
            false,
          ),
        ).toBeNull();
      },
    );
  },
);
