import { describe, expect, it } from "vitest";

import {
  restoreCanonicalBinaryStarterPlaceholders,
} from "@zoeskoul/learning-runtime/review/module/runtime/resolveWorkspaceForTarget";

const binary = {
  encoding: "base64" as const,
  data: "AAECAw==",
  mimeType: "image/png",
  sizeBytes: 4,
};

function workspace(content = "") {
  return {
    version: 2 as const,
    language: "web" as const,
    nodes: [
      {
        id: "folder:images",
        kind: "folder" as const,
        name: "images",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "file:profile",
        kind: "file" as const,
        name: "profile.png",
        parentId: "folder:images",
        content,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    openTabs: ["file:profile"],
    activeFileId: "file:profile",
    entryFileId: "file:profile",
    stdin: "",
    expanded: ["folder:images"],
    leftPct: 26,
  };
}

describe("canonical binary starter path ownership", () => {
  it("upgrades an empty legacy text placeholder", () => {
    const restored = restoreCanonicalBinaryStarterPlaceholders({
      base: workspace(),
      canonicalFiles: [
        {
          path: "images/profile.png",
          content: "",
          binary,
        },
      ],
    });

    const image = restored.nodes.find(
      (node) => node.kind === "file" && node.name === "profile.png",
    );

    expect(image && image.kind === "file" ? image.content : undefined).toBe("");
    expect(image && image.kind === "file" ? image.binary : undefined).toEqual(binary);
  });

  it("replaces nonblank HTML corruption at a canonical binary path", () => {
    const restored = restoreCanonicalBinaryStarterPlaceholders({
      base: workspace("<!doctype html><h1>Student Profile</h1>"),
      canonicalFiles: [
        {
          path: "images/profile.png",
          content: "",
          binary,
        },
      ],
    });

    const image = restored.nodes.find(
      (node) => node.kind === "file" && node.name === "profile.png",
    );

    expect(image && image.kind === "file" ? image.content : undefined).toBe("");
    expect(image && image.kind === "file" ? image.binary : undefined).toEqual(binary);
  });
});
