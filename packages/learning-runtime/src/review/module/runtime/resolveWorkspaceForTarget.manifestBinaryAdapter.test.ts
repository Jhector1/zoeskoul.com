import { describe, expect, it } from "vitest";

import {
  hydrateManifestWorkspaceBinaryFiles,
} from "./resolveWorkspaceForTarget";

const binaryRecord = {
  path: "images/profile.png",
  content: "",
  encoding: "base64" as const,
  data: "AAECAwQ=",
  mimeType: "image/png",
  sizeBytes: 5,
  checksum: "sha256:test",
};

function workspace() {
  return {
    version: 2 as const,
    language: "web" as const,
    nodes: [
      {
        id: "images",
        kind: "folder" as const,
        name: "images",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "profile",
        kind: "file" as const,
        name: "profile.png",
        parentId: "images",
        content: "",
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "index",
        kind: "file" as const,
        name: "index.html",
        parentId: null,
        content: "<h1>Profile</h1>",
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    openTabs: ["index"],
    activeFileId: "index",
    entryFileId: "index",
    stdin: "",
    expanded: ["images"],
    leftPct: 26,
  };
}

function file(result: any, name: string) {
  return result?.nodes.find(
    (node: any) => node.kind === "file" && node.name === name,
  );
}

describe("manifest binary adapter", () => {
  it("converts compiled top-level base64 fields into a runtime FileNode binary", () => {
    const result = hydrateManifestWorkspaceBinaryFiles({
      workspace: workspace(),
      rawManifest: {
        starterFiles: [binaryRecord],
      },
    });

    expect(file(result, "profile.png")?.content).toBe("");
    expect(file(result, "profile.png")?.binary).toEqual({
      encoding: "base64",
      data: "AAECAwQ=",
      mimeType: "image/png",
      sizeBytes: 5,
      checksum: "sha256:test",
    });
    expect(file(result, "index.html")?.content).toBe("<h1>Profile</h1>");
  });

  it("also accepts an already nested binary record without changing text files", () => {
    const result = hydrateManifestWorkspaceBinaryFiles({
      workspace: workspace(),
      rawManifest: {
        fixtureFiles: [
          {
            path: "images/profile.png",
            content: "",
            binary: {
              encoding: "base64",
              data: "AAECAwQ=",
              mimeType: "image/png",
              sizeBytes: 5,
            },
          },
        ],
      },
    });

    expect(file(result, "profile.png")?.binary?.encoding).toBe("base64");
    expect(file(result, "profile.png")?.binary?.data).toBe("AAECAwQ=");
    expect(file(result, "index.html")?.content).toBe("<h1>Profile</h1>");
  });
});
