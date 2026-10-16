import { describe, expect, it, vi } from "vitest";
import type { BuildProjectReadPort } from "./index";
import {
  BuildAccessError,
  getBuildProjectCommand,
  listBuildProjectsCommand,
} from "./index";

function reader(): BuildProjectReadPort {
  return {
    listOwnedBuildProjects: vi.fn(async () => []),
    getOwnedBuildProject: vi.fn(async () => null),
  };
}

describe("ZoeBuild read commands", () => {
  it("passes only the authenticated owner id into list persistence", async () => {
    const store = reader();

    await expect(
      listBuildProjectsCommand({
        access: { userId: " user_1 ", entitlements: [] },
        reader: store,
      }),
    ).resolves.toEqual([]);

    expect(store.listOwnedBuildProjects).toHaveBeenCalledWith("user_1");
  });

  it("fails closed before persistence for an unauthenticated actor", async () => {
    const store = reader();

    await expect(
      listBuildProjectsCommand({
        access: { userId: null, entitlements: [] },
        reader: store,
      }),
    ).rejects.toBeInstanceOf(BuildAccessError);

    expect(store.listOwnedBuildProjects).not.toHaveBeenCalled();
  });

  it("keeps missing or foreign detail indistinguishable as null", async () => {
    const store = reader();

    await expect(
      getBuildProjectCommand({
        access: { userId: "user_2", entitlements: [] },
        buildProjectId: "build_missing",
        reader: store,
      }),
    ).resolves.toBeNull();

    expect(store.getOwnedBuildProject).toHaveBeenCalledWith(
      "user_2",
      "build_missing",
    );
  });
});
