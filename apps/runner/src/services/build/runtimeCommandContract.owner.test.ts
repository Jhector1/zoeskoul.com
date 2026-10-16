import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    "utf8",
  );
}

describe("trusted build runtime image command contract", () => {
  it("passes runner-owned argv to the runtime image through RUN_CMD_JSON", () => {
    const helper = source("./runtimeCommandEnv.ts");
    const bootstrap = source("./executeDependencyLockBootstrap.ts");
    const production = source("./executeProductionBuild.ts");

    expect(helper).toContain(
      "RUN_CMD_JSON=${JSON.stringify(command)}",
    );
    expect(bootstrap).toContain(
      "trustedRuntimeCommandEnv(args.command)",
    );
    expect(production).toContain(
      "trustedRuntimeCommandEnv(args.command)",
    );
  });

  it("makes Vite preview inherit the same trusted production container boundary", () => {
    const preview = source("./reactPreviewRuntime.ts");

    expect(preview).toContain(
      "buildProductionBuildContainerOptions({",
    );
    expect(preview).not.toContain("RUN_CMD_JSON=");
  });

  it("does not add a shell or user-controlled executor env surface", () => {
    const helper = source("./runtimeCommandEnv.ts");

    expect(helper).not.toContain("spawn(");
    expect(helper).not.toContain("exec(");
    expect(helper).not.toContain("shell:");
  });
});
