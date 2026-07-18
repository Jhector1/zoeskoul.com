import { describe, expect, it } from "vitest";
import { mergeManifestIdeServiceConfigs } from "./ide-services.js";

describe("mergeManifestIdeServiceConfigs", () => {
  it("merges terminal bootstrap paths additively without duplicates", () => {
    expect(
      mergeManifestIdeServiceConfigs(
        {
          runnerBackend: "pty",
          terminalBootstrap: {
            gitSafeDirectories: ["/workspace/trail-journal"],
            setupScriptPath: ".zoeskoul/old-setup.sh",
            workspaceStateKey: "git-state-old",
          },
        },
        {
          layoutMode: "default",
          terminalBootstrap: {
            gitSafeDirectories: ["/workspace/*", "/workspace/trail-journal"],
            setupScriptPath: ".zoeskoul/setup.sh",
            workspaceStateKey: "git-state-current",
          },
        },
      ),
    ).toEqual({
      runnerBackend: "pty",
      layoutMode: "default",
      terminalBootstrap: {
        gitSafeDirectories: ["/workspace/trail-journal", "/workspace/*"],
        setupScriptPath: ".zoeskoul/setup.sh",
        workspaceStateKey: "git-state-current",
      },
    });
  });

  it("does not invent terminal bootstrap for unrelated courses", () => {
    expect(
      mergeManifestIdeServiceConfigs({
        runnerBackend: "pty",
        requires: { terminal: true },
      }),
    ).toEqual({
      runnerBackend: "pty",
      requires: { terminal: true },
    });
  });
});
