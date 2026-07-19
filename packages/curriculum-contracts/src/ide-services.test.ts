import { describe, expect, it } from "vitest";
import {
  deriveManifestTerminalBootstrap,
  mergeManifestIdeServiceConfigs,
} from "./ide-services.js";

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


describe("deriveManifestTerminalBootstrap", () => {
  it("derives hidden setup metadata from the authored workspace", () => {
    const bootstrap = deriveManifestTerminalBootstrap({
      bootstrap: { gitSafeDirectories: ["/workspace/*"] },
      terminalCwd: "/workspace/trail-journal",
      files: [
        {
          kind: "file",
          path: ".zoeskoul/setup.sh",
          content: "git -C trail-journal init -q -b main\n",
          language: "bash",
          readOnly: true,
        },
        {
          kind: "file",
          path: "trail-journal/README.md",
          content: "# Trail Journal\n",
          language: "markdown",
        },
      ],
    });

    expect(bootstrap).toEqual({
      gitSafeDirectories: ["/workspace/*"],
      setupScriptPath: ".zoeskoul/setup.sh",
      workspaceStateKey: expect.stringMatching(/^git-state-v1-/),
    });
  });

  it("changes the state key when the hidden setup recipe changes", () => {
    const first = deriveManifestTerminalBootstrap({
      bootstrap: { gitSafeDirectories: ["/workspace/*"] },
      terminalCwd: "/workspace/trail-journal",
      files: [
        { path: ".zoeskoul/setup.sh", content: "git init -q -b main\n" },
        { path: "trail-journal/README.md", content: "same learner file\n" },
      ],
    });
    const second = deriveManifestTerminalBootstrap({
      bootstrap: { gitSafeDirectories: ["/workspace/*"] },
      terminalCwd: "/workspace/trail-journal",
      files: [
        {
          path: ".zoeskoul/setup.sh",
          content: "git init -q -b trunk\n",
        },
        { path: "trail-journal/README.md", content: "same learner file\n" },
      ],
    });

    expect(first?.workspaceStateKey).not.toBe(second?.workspaceStateKey);
  });

  it("keeps the state key stable across learner-visible file edits", () => {
    const first = deriveManifestTerminalBootstrap({
      bootstrap: { gitSafeDirectories: ["/workspace/*"] },
      terminalCwd: "/workspace/trail-journal",
      files: [
        { path: ".zoeskoul/setup.sh", content: "git init -q -b main\n" },
        { path: "trail-journal/README.md", content: "before\n" },
      ],
    });
    const second = deriveManifestTerminalBootstrap({
      bootstrap: { gitSafeDirectories: ["/workspace/*"] },
      terminalCwd: "/workspace/trail-journal",
      files: [
        { path: ".zoeskoul/setup.sh", content: "git init -q -b main\n" },
        { path: "trail-journal/README.md", content: "after\n" },
      ],
    });

    expect(first?.workspaceStateKey).toBe(second?.workspaceStateKey);
  });

  it("does not infer setup for an ordinary workspace", () => {
    expect(
      deriveManifestTerminalBootstrap({
        terminalCwd: "/workspace/python-project",
        files: [{ path: "main.py", content: "print('hello')\n" }],
      }),
    ).toBeUndefined();
  });
});
