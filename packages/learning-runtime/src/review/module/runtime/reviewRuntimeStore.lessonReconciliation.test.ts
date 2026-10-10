import { describe, expect, it } from "vitest";

import {
  repairLegacyCollapsedRuntimeStarterFiles,
  restoreCanonicalRuntimeBinaryAssets,
} from "./reviewRuntimeStore";

const binary = {
  encoding: "base64" as const,
  data: "AAECAwQ=",
  mimeType: "image/png",
  sizeBytes: 5,
};

function workspace(args: {
  index: string;
  about: string;
  image?: "binary" | "blank" | "missing";
}) {
  const nodes: any[] = [
    {
      id: "index",
      kind: "file",
      name: "index.html",
      parentId: null,
      content: args.index,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "about",
      kind: "file",
      name: "about.html",
      parentId: null,
      content: args.about,
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  if (args.image && args.image !== "missing") {
    nodes.push(
      {
        id: "images",
        kind: "folder",
        name: "images",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "profile",
        kind: "file",
        name: "profile.png",
        parentId: "images",
        content: "",
        ...(args.image === "binary" ? { binary } : {}),
        createdAt: 0,
        updatedAt: 0,
      },
    );
  }

  return {
    version: 2 as const,
    language: "web" as const,
    nodes,
    openTabs: ["index"],
    activeFileId: "index",
    entryFileId: "index",
    stdin: "",
    expanded:
      args.image && args.image !== "missing" ? ["images"] : [],
    leftPct: 26,
  } as any;
}

function file(workspaceValue: any, name: string) {
  return workspaceValue.nodes.find(
    (node: any) => node.kind === "file" && node.name === name,
  );
}

describe("review runtime lesson reconciliation", () => {
  it("repairs the known repeated-authored-starter corruption", () => {
    const starter = workspace({
      index: "<h1>Profile</h1>",
      about: "<h1>About</h1>",
      image: "binary",
    });
    const corrupted = workspace({
      index: "<h1>About</h1>",
      about: "<h1>About</h1>",
      image: "missing",
    });

    const repaired = repairLegacyCollapsedRuntimeStarterFiles({
      incomingWorkspace: corrupted,
      starterWorkspace: starter,
    });

    expect(file(repaired, "index.html")?.content).toBe(
      "<h1>Profile</h1>",
    );
    expect(file(repaired, "about.html")?.content).toBe(
      "<h1>About</h1>",
    );
  });

  it("does not rewrite legitimate distinct learner text", () => {
    const starter = workspace({
      index: "<h1>Profile</h1>",
      about: "<h1>About</h1>",
      image: "binary",
    });
    const learner = workspace({
      index: "<h1>My profile</h1>",
      about: "<h1>My about</h1>",
      image: "missing",
    });

    const repaired = repairLegacyCollapsedRuntimeStarterFiles({
      incomingWorkspace: learner,
      starterWorkspace: starter,
    });

    expect(file(repaired, "index.html")?.content).toBe(
      "<h1>My profile</h1>",
    );
    expect(file(repaired, "about.html")?.content).toBe(
      "<h1>My about</h1>",
    );
  });

  it("restores a completely missing canonical binary asset", () => {
    const starter = workspace({
      index: "<h1>Profile</h1>",
      about: "<h1>About</h1>",
      image: "binary",
    });
    const incoming = workspace({
      index: "<h1>My edit</h1>",
      about: "<h1>About</h1>",
      image: "missing",
    });

    const repaired = restoreCanonicalRuntimeBinaryAssets({
      incomingWorkspace: incoming,
      starterWorkspace: starter,
    });

    expect(file(repaired, "index.html")?.content).toBe(
      "<h1>My edit</h1>",
    );
    expect(file(repaired, "profile.png")?.binary).toEqual(binary);
  });

  it("replaces blank and nonblank text corruption at a canonical binary path", () => {
    const starter = workspace({
      index: "<h1>Profile</h1>",
      about: "<h1>About</h1>",
      image: "binary",
    });
    const blank = workspace({
      index: "<h1>My edit</h1>",
      about: "<h1>About</h1>",
      image: "blank",
    });

    const upgraded = restoreCanonicalRuntimeBinaryAssets({
      incomingWorkspace: blank,
      starterWorkspace: starter,
    });
    expect(file(upgraded, "profile.png")?.content).toBe("");
    expect(file(upgraded, "profile.png")?.binary).toEqual(binary);

    const corrupted = workspace({
      index: "<h1>My edit</h1>",
      about: "<h1>About</h1>",
      image: "blank",
    });
    file(corrupted, "profile.png").content =
      "<!doctype html><h1>Student Profile</h1>";

    const repaired = restoreCanonicalRuntimeBinaryAssets({
      incomingWorkspace: corrupted,
      starterWorkspace: starter,
    });

    expect(file(repaired, "index.html")?.content).toBe("<h1>My edit</h1>");
    expect(file(repaired, "profile.png")?.content).toBe("");
    expect(file(repaired, "profile.png")?.binary).toEqual(binary);
  });
});
