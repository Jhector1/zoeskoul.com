import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildPublishedStaticFileMap,
  resolvePublishedStaticFile,
} from "./staticPublishedArtifact";

function workspace() {
  return {
    version: 2,
    language: "javascript",
    openTabs: [],
    activeFileId: "index",
    entryFileId: "index",
    stdin: "",
    expanded: [],
    leftPct: 20,

    nodes: [
      {
        id: "index",
        kind: "file",
        name: "index.html",
        parentId: null,
        content: "<h1>Published</h1>",
        createdAt: 1,
        updatedAt: 1,
      },

      {
        id: "assets",
        kind: "folder",
        name: "assets",
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
      },

      {
        id: "css",
        kind: "file",
        name: "site.css",
        parentId: "assets",
        content: "body{}",
        createdAt: 1,
        updatedAt: 1,
      },

      {
        id: "pixel",
        kind: "file",
        name: "pixel.png",
        parentId: "assets",
        content: "",
        binary: {
          encoding: "base64",
          data: "aGVsbG8=",
          mimeType: "image/png",
          sizeBytes: 5,
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

describe(
  "ZoeBuild published static artifact",
  () => {
    it(
      "serves root and nested text files",
      () => {
        const files =
          buildPublishedStaticFileMap(
            workspace(),
          );

        expect(
          resolvePublishedStaticFile(
            files,
            "",
            true,
          ),
        ).toMatchObject({
          path: "index.html",
          contentType:
            "text/html; charset=utf-8",
        });

        expect(
          resolvePublishedStaticFile(
            files,
            "assets/site.css",
            false,
          ),
        ).toMatchObject({
          path:
            "assets/site.css",
          body:
            "body{}",
        });
      },
    );

    it(
      "decodes binary files without exposing Monaco placeholder text",
      () => {
        const files =
          buildPublishedStaticFileMap(
            workspace(),
          );

        const file =
          resolvePublishedStaticFile(
            files,
            "assets/pixel.png",
            false,
          );

        expect(
          file?.contentType,
        ).toBe(
          "image/png",
        );

        expect(
          file?.body,
        ).toBeInstanceOf(
          Uint8Array,
        );
      },
    );

    it(
      "supports HTML route fallback while rejecting traversal",
      () => {
        const files =
          buildPublishedStaticFileMap(
            workspace(),
          );

        expect(
          resolvePublishedStaticFile(
            files,
            "about",
            true,
          )?.path,
        ).toBe(
          "index.html",
        );

        expect(
          () =>
            resolvePublishedStaticFile(
              files,
              "../secret",
              true,
            ),
        ).toThrow(
          /unsafe/i,
        );
      },
    );
  },
);
