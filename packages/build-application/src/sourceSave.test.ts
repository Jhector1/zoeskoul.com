import { describe, expect, it, vi } from "vitest";
import type {
  BuildProjectSourceWritePort,
  BuildSourceSavePersistenceInput,
} from "./index";
import {
  BuildAccessError,
  BuildSourceInputError,
  saveBuildProjectSourceCommand,
} from "./index";

const workspace = {
  version: 2 as const,
  language: "web" as const,
  nodes: [
    {
      id: "index.html",
      kind: "file" as const,
      name: "index.html",
      parentId: null,
      content: "<h1>Hello</h1>",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  openTabs: ["index.html"],
  activeFileId: "index.html",
  entryFileId: "index.html",
  stdin: "",
  expanded: [],
  leftPct: 26,
};

function writer(): BuildProjectSourceWritePort {
  return {
    saveOwnedBuildProjectSource: vi.fn(
      async (_input: BuildSourceSavePersistenceInput) => ({
        sourceVersion: 2,
        changed: true,
        workspaceChanged: true,
        updatedAt: "2026-10-14T00:00:00.000Z",
      }),
    ),
  };
}

describe("ZoeBuild source-save command", () => {
  it("passes authenticated ownership and optimistic base version to persistence", async () => {
    const store = writer();

    await expect(
      saveBuildProjectSourceCommand({
        access: { userId: " user_1 ", entitlements: [] },
        buildProjectId: " build_1 ",
        baseVersion: 1,
        workspace,
        writer: store,
        clientInstanceId: " client_1 ",
        clientDraftUpdatedAt: " 2026-10-14T00:00:00.000Z ",
      }),
    ).resolves.toMatchObject({ sourceVersion: 2 });

    expect(store.saveOwnedBuildProjectSource).toHaveBeenCalledWith({
      ownerId: "user_1",
      buildProjectId: "build_1",
      baseVersion: 1,
      workspace,
      clientInstanceId: "client_1",
      clientDraftUpdatedAt: "2026-10-14T00:00:00.000Z",
    });
  });

  it("fails before persistence when authentication is missing", async () => {
    const store = writer();

    await expect(
      saveBuildProjectSourceCommand({
        access: { userId: null, entitlements: [] },
        buildProjectId: "build_1",
        baseVersion: 1,
        workspace,
        writer: store,
      }),
    ).rejects.toBeInstanceOf(BuildAccessError);

    expect(store.saveOwnedBuildProjectSource).not.toHaveBeenCalled();
  });

  it("rejects invalid client base versions before persistence", async () => {
    const store = writer();

    await expect(
      saveBuildProjectSourceCommand({
        access: { userId: "user_1", entitlements: [] },
        buildProjectId: "build_1",
        baseVersion: 0,
        workspace,
        writer: store,
      }),
    ).rejects.toBeInstanceOf(BuildSourceInputError);

    expect(store.saveOwnedBuildProjectSource).not.toHaveBeenCalled();
  });
});
