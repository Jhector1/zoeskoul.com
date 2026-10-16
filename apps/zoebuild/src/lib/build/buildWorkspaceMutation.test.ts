import { describe, expect, it } from "vitest";

import {
  BuildWorkspaceMutationError,
  parseBuildWorkspaceMutation,
} from "./buildWorkspaceMutation";

function validWorkspace() {
  return {
    version: 2,
    language: "web",
    nodes: [
      {
        id: "src",
        kind: "folder",
        name: "src",
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "app",
        kind: "file",
        name: "App.tsx",
        parentId: "src",
        content: "export default function App() { return null; }",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    openTabs: ["app"],
    activeFileId: "app",
    entryFileId: "app",
    stdin: "",
    expanded: ["src"],
    leftPct: 25,
  };
}

describe("ZoeBuild workspace mutation validation", () => {
  it("accepts a normal source workspace", () => {
    expect(parseBuildWorkspaceMutation(validWorkspace())).toMatchObject({
      version: 2,
      language: "web",
      activeFileId: "app",
    });
  });

  it("rejects parent cycles before recursive shared validation", () => {
    const ws = validWorkspace();
    ws.nodes = [
      {
        id: "a",
        kind: "folder",
        name: "a",
        parentId: "b",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        kind: "folder",
        name: "b",
        parentId: "a",
        createdAt: 1,
        updatedAt: 1,
      },
    ] as typeof ws.nodes;

    expect(() => parseBuildWorkspaceMutation(ws)).toThrow(
      BuildWorkspaceMutationError,
    );
  });

  it("rejects duplicate sibling paths and path traversal segments", () => {
    const duplicate = validWorkspace();
    duplicate.nodes.push({
      id: "app2",
      kind: "file",
      name: "app.tsx",
      parentId: "src",
      content: "",
      createdAt: 1,
      updatedAt: 1,
    });

    expect(() => parseBuildWorkspaceMutation(duplicate)).toThrow(
      /siblings may not share/i,
    );

    const traversal = validWorkspace();
    traversal.nodes[0] = {
      ...traversal.nodes[0],
      name: "..",
    };

    expect(() => parseBuildWorkspaceMutation(traversal)).toThrow(
      /unsafe workspace node name/i,
    );
  });

  it("rejects control directories such as .git", () => {
    const ws = validWorkspace();
    ws.nodes[0] = {
      ...ws.nodes[0],
      name: ".git",
    };

    expect(() => parseBuildWorkspaceMutation(ws)).toThrow(
      /control path is not allowed/i,
    );
  });
});
