import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveWorkspaceInitialPane,
} from "./workspaceInitialPane";

describe("resolveWorkspaceInitialPane", () => {
  it("honors an explicit Editor outer surface", () => {
    expect(
      resolveWorkspaceInitialPane({
        defaultSurface: "editor",
      }),
    ).toBe("editor");
  });

  it("honors an explicit Results outer surface", () => {
    expect(
      resolveWorkspaceInitialPane({
        defaultSurface: "results",
      }),
    ).toBe("output");
  });

  it("does not let an inner SQL tab choose the outer surface", () => {
    expect(
      resolveWorkspaceInitialPane({
        language: "sql",
        sqlPaneOptions: {
          defaultTab: "tables",
        },
      }),
    ).toBe("editor");

    expect(
      resolveWorkspaceInitialPane({
        language: "sql",
        sqlPaneOptions: {
          defaultTab: "erd",
        },
      }),
    ).toBe("editor");

    expect(
      resolveWorkspaceInitialPane({
        language: "sql",
        sqlPaneOptions: {
          compactDefaultTab: "results",
        },
      }),
    ).toBe("editor");
  });

  it("does not let an inner runner tab choose the outer surface", () => {
    expect(
      resolveWorkspaceInitialPane({
        runnerPaneOptions: {
          defaultTab: "terminal",
        },
      }),
    ).toBe("editor");

    expect(
      resolveWorkspaceInitialPane({
        runnerPaneOptions: {
          compactDefaultTab: "terminal",
        },
      }),
    ).toBe("editor");
  });

  it("defaults a normal hands-on workspace to Editor", () => {
    expect(
      resolveWorkspaceInitialPane({
        language: "sql",
      }),
    ).toBe("editor");
  });
});
