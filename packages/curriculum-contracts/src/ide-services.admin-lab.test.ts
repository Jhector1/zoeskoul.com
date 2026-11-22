import { describe, expect, it } from "vitest";
import { mergeManifestIdeServiceConfigs } from "./ide-services.js";

describe("manifest administrator lab presentation capability", () => {
  it("defaults to ordinary services unless explicitly eligible", () => {
    expect(mergeManifestIdeServiceConfigs({ runnerBackend: "pty" }))
      .toEqual({ runnerBackend: "pty" });
  });

  it("merges authoring scopes with explicit descendant precedence", () => {
    const merged = mergeManifestIdeServiceConfigs(
      { runnerBackend: "pty", administratorLab: "disabled" },
      { requires: { terminal: true } },
      { layoutMode: "terminal_workspace" },
      { administratorLab: "eligible" },
    );
    expect(merged).toMatchObject({
      runnerBackend: "pty", layoutMode: "terminal_workspace",
      requires: { terminal: true }, administratorLab: "eligible",
    });
    expect(mergeManifestIdeServiceConfigs(merged, {administratorLab: "disabled"})
      ?.administratorLab).toBe("disabled");
  });

  it("does not treat malformed capability values as privileged", () => {
    expect(mergeManifestIdeServiceConfigs({ administratorLab: "root" as any })
      ?.administratorLab).toBeUndefined();
  });
});
