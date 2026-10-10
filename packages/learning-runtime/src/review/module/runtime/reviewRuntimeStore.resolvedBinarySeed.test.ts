import { describe, expect, it } from "vitest";

import {
  mergeMissingFilesFromResolvedWorkspace,
} from "./reviewRuntimeStore";

const binary = {
  encoding: "base64" as const,
  data: "AAECAwQ=",
  mimeType: "image/png",
  sizeBytes: 5,
};

function baseWorkspace(profile: "blank" | "html" | "binary") {
  return {
    version: 2 as const,
    language: "web" as const,
    nodes: [
      {
        id: "index",
        kind: "file" as const,
        name: "index.html",
        parentId: null,
        content: "<h1>My learner edit</h1>",
        createdAt: 0,
        updatedAt: 1,
      },
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
        content:
          profile === "html"
            ? "<!doctype html><h1>Old index payload</h1>"
            : "",
        ...(profile === "binary" ? { binary } : {}),
        createdAt: 0,
        updatedAt: 1,
      },
    ],
    openTabs: ["index", "profile"],
    activeFileId: "profile",
    entryFileId: "index",
    stdin: "",
    expanded: ["images"],
    leftPct: 26,
  };
}

function resolvedWorkspace() {
  return {
    version: 2 as const,
    language: "web" as const,
    nodes: [
      {
        id: "starter-index",
        kind: "file" as const,
        name: "index.html",
        parentId: null,
        content: "<h1>Canonical starter</h1>",
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "starter-images",
        kind: "folder" as const,
        name: "images",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "starter-profile",
        kind: "file" as const,
        name: "profile.png",
        parentId: "starter-images",
        content: "",
        binary,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    openTabs: ["starter-index"],
    activeFileId: "starter-index",
    entryFileId: "starter-index",
    stdin: "",
    expanded: ["starter-images"],
    leftPct: 26,
  };
}

function file(workspace: any, name: string) {
  return workspace?.nodes.find(
    (node: any) => node.kind === "file" && node.name === name,
  );
}

describe("initial saved Lesson runtime binary reconciliation", () => {
  it("upgrades a same-path blank text placeholder to canonical binary", () => {
    const result = mergeMissingFilesFromResolvedWorkspace({
      baseWorkspace: baseWorkspace("blank"),
      resolvedWorkspace: resolvedWorkspace(),
    });

    expect(file(result, "index.html")?.content).toBe(
      "<h1>My learner edit</h1>",
    );
    expect(file(result, "profile.png")?.content).toBe("");
    expect(file(result, "profile.png")?.binary).toEqual(binary);
  });

  it("replaces stale HTML corruption at a canonical binary path", () => {
    const result = mergeMissingFilesFromResolvedWorkspace({
      baseWorkspace: baseWorkspace("html"),
      resolvedWorkspace: resolvedWorkspace(),
    });

    expect(file(result, "index.html")?.content).toBe(
      "<h1>My learner edit</h1>",
    );
    expect(file(result, "profile.png")?.content).toBe("");
    expect(file(result, "profile.png")?.binary).toEqual(binary);
  });

  it("leaves an already-correct canonical binary node unchanged", () => {
    const base = baseWorkspace("binary");
    const result = mergeMissingFilesFromResolvedWorkspace({
      baseWorkspace: base,
      resolvedWorkspace: resolvedWorkspace(),
    });

    expect(result).toBe(base);
  });
});
